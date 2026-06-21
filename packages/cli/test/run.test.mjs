import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(testDir, "../dist/cli.js");
const projectDir = path.join(testDir, "fixtures/valid");
const prContextPath = path.join(
  testDir,
  "fixtures/pr-context/github-pr-context.json",
);

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: path.resolve(testDir, "../../.."),
    encoding: "utf8",
  });
}

function createOutDir() {
  return mkdtempSync(path.join(tmpdir(), "qa-agent-run-"));
}

function readReport(outDir) {
  return JSON.parse(readFileSync(path.join(outDir, "qa-report.json"), "utf8"));
}

function writeConfig(outDir, actionSafetyPolicy) {
  const configPath = path.join(outDir, "qa-agent.config.mjs");
  writeFileSync(
    configPath,
    `export default ${JSON.stringify(
      {
        targetPlatforms: ["android"],
        model: {
          provider: "openai",
          modelId: "gpt-4.1",
          apiKeyEnv: "OPENAI_API_KEY",
        },
        app: {
          adapter: "expo-eas",
          easProjectId: "00000000-0000-0000-0000-000000000000",
          android: {
            applicationId: "com.example.qaagent",
          },
        },
        screenshotStorage: {
          provider: "artifact",
          artifactsDir: "qa-agent/screenshots",
        },
        actionSafetyPolicy,
      },
      null,
      2,
    )};\n`,
    "utf8",
  );
  return configPath;
}

function writeAuthConfig(outDir) {
  const configPath = path.join(outDir, "qa-agent.config.mjs");
  writeFileSync(
    configPath,
    `export default ${JSON.stringify(
      {
        targetPlatforms: ["android"],
        model: {
          provider: "openai",
          modelId: "gpt-4.1",
          apiKeyEnv: "OPENAI_API_KEY",
        },
        app: {
          adapter: "expo-eas",
          easProjectId: "00000000-0000-0000-0000-000000000000",
          android: {
            applicationId: "com.example.qaagent",
          },
        },
        screenshotStorage: {
          provider: "artifact",
          artifactsDir: "qa-agent/screenshots",
        },
        actionSafetyPolicy: {
          mode: "safe_only",
        },
        authProfiles: {
          qa_user: {
            type: "email_password",
            emailEnv: "QA_AGENT_LOGIN_EMAIL",
            passwordEnv: "QA_AGENT_LOGIN_PASSWORD",
            emailField: 'id="email"',
            passwordField: 'id="password"',
            submitButton: 'id="submit"',
          },
        },
      },
      null,
      2,
    )};\n`,
    "utf8",
  );
  return configPath;
}

describe("qa-agent run", () => {
  it("executes a mocked QA Run and writes exactly one validated QA Report artifact", () => {
    const outDir = createOutDir();
    const result = runCli([
      "run",
      "--project",
      projectDir,
      "--pr-context",
      prContextPath,
      "--out",
      outDir,
      "--mock-device-driver",
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /QA Agent run completed/);
    assert.match(result.stdout, /Status: passed/);
    assert.equal(result.stderr, "");
    assert.deepEqual(readdirSync(outDir), ["qa-report.json"]);

    const report = readReport(outDir);
    assert.equal(report.status, "passed");
    assert.match(report.summary, /Mocked android QA Run completed/);
    assert.deepEqual(report.issuesFound, []);
    assert.equal(report.screenshots.length, 1);
  });

  it("executes a local debug run against a mocked already-running app/device", () => {
    const outDir = createOutDir();
    const result = runCli([
      "run-local",
      "--project",
      projectDir,
      "--pr-context",
      prContextPath,
      "--out",
      outDir,
      "--mock-device-driver",
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /QA Agent local debug run completed/);
    assert.match(result.stdout, /app and device are already running/);
    assert.match(result.stdout, /does not build, install, provision, or launch/);
    assert.match(result.stdout, /Status: passed/);
    assert.equal(result.stderr, "");
    assert.deepEqual(readdirSync(outDir), ["qa-report.json"]);

    const report = readReport(outDir);
    assert.equal(report.status, "passed");
    assert.match(report.summary, /local debug QA Run completed/);
    assert.deepEqual(report.issuesFound, []);
    assert.equal(report.screenshots.length, 1);
  });

  it("turns an invalid write_report result into a blocked report with diagnostics", () => {
    const outDir = createOutDir();
    const result = runCli([
      "run",
      "--project",
      projectDir,
      "--pr-context",
      prContextPath,
      "--out",
      outDir,
      "--mock-report",
      path.join(testDir, "fixtures/reports/invalid-report.json"),
      "--mock-device-driver",
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Status: blocked/);
    assert.equal(result.stderr, "");
    assert.deepEqual(readdirSync(outDir), ["qa-report.json"]);

    const report = readReport(outDir);
    assert.equal(report.status, "blocked");
    assert.match(report.summary, /could not produce a valid QA Report/);
    assert.match(report.diagnostics.join("\n"), /invalid payload/);
    assert.match(report.diagnostics.join("\n"), /status/);
  });

  it("turns malformed mock write_report JSON into a blocked report with diagnostics", () => {
    const outDir = createOutDir();
    const malformedReportPath = path.join(outDir, "malformed-report.txt");
    writeFileSync(malformedReportPath, "{", "utf8");

    const result = runCli([
      "run",
      "--project",
      projectDir,
      "--pr-context",
      prContextPath,
      "--out",
      outDir,
      "--mock-report",
      malformedReportPath,
      "--mock-device-driver",
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Status: blocked/);
    assert.equal(result.stderr, "");

    const report = readReport(outDir);
    assert.equal(report.status, "blocked");
    assert.match(report.diagnostics.join("\n"), /Failed to parse mock write_report JSON/);
    assert.match(report.diagnostics.join("\n"), /Expected exactly one write_report/);
  });

  it("turns a missing write_report result into a blocked report with diagnostics", () => {
    const outDir = createOutDir();
    const result = runCli([
      "run",
      "--project",
      projectDir,
      "--pr-context",
      prContextPath,
      "--out",
      outDir,
      "--mock-report",
      path.join(outDir, "missing-report.json"),
      "--mock-device-driver",
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Status: blocked/);
    assert.equal(result.stderr, "");
    assert.deepEqual(readdirSync(outDir), ["qa-report.json"]);

    const report = readReport(outDir);
    assert.equal(report.status, "blocked");
    assert.match(report.diagnostics.join("\n"), /Expected exactly one write_report/);
    assert.match(report.diagnostics.join("\n"), /Failed to read mock write_report JSON/);
    assert.match(report.diagnostics.join("\n"), /not provided/);
  });

  it("stops before a passed report when a required mobile tool is blocked", () => {
    const outDir = createOutDir();
    const configPath = writeConfig(outDir, {
      mode: "allow_project_actions",
      allowedIntents: [],
      forbiddenIntents: ["take_screenshot"],
    });
    const result = runCli([
      "run",
      "--project",
      projectDir,
      "--config",
      configPath,
      "--pr-context",
      prContextPath,
      "--out",
      outDir,
      "--mock-device-driver",
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Status: blocked/);
    assert.equal(result.stderr, "");

    const report = readReport(outDir);
    assert.equal(report.status, "blocked");
    assert.deepEqual(report.screenshots, []);
    assert.match(report.diagnostics.join("\n"), /take_screenshot was blocked/);
    assert.match(report.diagnostics.join("\n"), /Expected exactly one write_report/);
  });

  it("logs in with a configured Auth Profile before producing the report", () => {
    const outDir = createOutDir();
    const configPath = writeAuthConfig(outDir);
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "run",
        "--project",
        projectDir,
        "--config",
        configPath,
        "--pr-context",
        prContextPath,
        "--out",
        outDir,
        "--mock-device-driver",
      ],
      {
        cwd: path.resolve(testDir, "../../.."),
        encoding: "utf8",
        env: {
          ...process.env,
          QA_AGENT_LOGIN_EMAIL: "qa@example.com",
          QA_AGENT_LOGIN_PASSWORD: "super-secret-password",
        },
      },
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Status: passed/);
    assert.equal(result.stderr, "");

    const report = readReport(outDir);
    assert.equal(report.status, "passed");
    assert.match(report.checksPerformed.join("\n"), /Auth Profile/);
    assert.doesNotMatch(JSON.stringify(report), /qa@example\.com/);
    assert.doesNotMatch(JSON.stringify(report), /super-secret-password/);
  });

  it("uses configured Auth Profiles in local debug mode without exposing secrets", () => {
    const outDir = createOutDir();
    const configPath = writeAuthConfig(outDir);
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "run-local",
        "--project",
        projectDir,
        "--config",
        configPath,
        "--pr-context",
        prContextPath,
        "--out",
        outDir,
        "--mock-device-driver",
      ],
      {
        cwd: path.resolve(testDir, "../../.."),
        encoding: "utf8",
        env: {
          ...process.env,
          QA_AGENT_LOGIN_EMAIL: "qa@example.com",
          QA_AGENT_LOGIN_PASSWORD: "super-secret-password",
        },
      },
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /QA Agent local debug run completed/);
    assert.match(result.stdout, /app and device are already running/);
    assert.match(result.stdout, /Status: passed/);
    assert.equal(result.stderr, "");

    const report = readReport(outDir);
    assert.equal(report.status, "passed");
    assert.match(report.checksPerformed.join("\n"), /Auth Profile/);
    assert.doesNotMatch(JSON.stringify(report), /qa@example\.com/);
    assert.doesNotMatch(JSON.stringify(report), /super-secret-password/);
    assert.doesNotMatch(result.stdout, /qa@example\.com|super-secret-password/);
  });

  it("turns missing Auth Profile secrets into a blocked report with redacted diagnostics", () => {
    const outDir = createOutDir();
    const configPath = writeAuthConfig(outDir);
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "run",
        "--project",
        projectDir,
        "--config",
        configPath,
        "--pr-context",
        prContextPath,
        "--out",
        outDir,
        "--mock-device-driver",
      ],
      {
        cwd: path.resolve(testDir, "../../.."),
        encoding: "utf8",
        env: {
          ...process.env,
          QA_AGENT_LOGIN_EMAIL: "qa@example.com",
          QA_AGENT_LOGIN_PASSWORD: "",
        },
      },
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Status: blocked/);
    assert.equal(result.stderr, "");

    const report = readReport(outDir);
    assert.equal(report.status, "blocked");
    assert.match(report.diagnostics.join("\n"), /QA_AGENT_LOGIN_PASSWORD/);
    assert.doesNotMatch(JSON.stringify(report), /qa@example\.com/);
  });

  it("reports malformed PR Context JSON without throwing", () => {
    const outDir = createOutDir();
    const malformedPrContextPath = path.join(outDir, "malformed-pr-context.txt");
    writeFileSync(malformedPrContextPath, "{", "utf8");

    const result = runCli([
      "run",
      "--project",
      projectDir,
      "--pr-context",
      malformedPrContextPath,
      "--out",
      outDir,
      "--mock-device-driver",
    ]);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /QA Agent run found 1 PR Context issue/);
    assert.match(result.stderr, /Failed to parse PR Context JSON/);
  });

  it("reports invalid platform values without throwing", () => {
    const result = runCli([
      "run",
      "--project",
      projectDir,
      "--pr-context",
      prContextPath,
      "--platform",
      "web",
      "--mock-device-driver",
    ]);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /--platform must be "android" or "ios"/);
    assert.doesNotMatch(result.stderr, /Error:/);
  });

  it("prints help for the run command", () => {
    const result = runCli(["run", "--help"]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: qa-agent run/);
    assert.match(result.stdout, /--pr-context <path>/);
    assert.equal(result.stderr, "");
  });

  it("prints help for the run-local command", () => {
    const result = runCli(["run-local", "--help"]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: qa-agent run-local/);
    assert.match(result.stdout, /--pr-context <path>/);
    assert.match(result.stdout, /app and device are already running/);
    assert.match(result.stdout, /does not build, install, provision, or launch/);
    assert.equal(result.stderr, "");
  });
});
