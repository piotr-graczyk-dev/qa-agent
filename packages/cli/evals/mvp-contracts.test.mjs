import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  renderQaReportComment,
  validateQaReport,
} from "../dist/index.js";

const evalDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(evalDir, "..");
const workspaceDir = path.resolve(packageDir, "../..");
const cliPath = path.join(packageDir, "dist", "cli.js");
const fixtureDir = path.join(packageDir, "test", "fixtures");
const validProjectDir = path.join(fixtureDir, "valid");
const prContextPath = path.join(
  fixtureDir,
  "pr-context",
  "github-pr-context.json",
);

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: workspaceDir,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function createOutDir() {
  return mkdtempSync(path.join(tmpdir(), "qa-agent-contract-eval-"));
}

function readReport(outDir) {
  return JSON.parse(readFileSync(path.join(outDir, "qa-report.json"), "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

describe("MVP contract evals", () => {
  it("writes exactly one validated report artifact for a mocked QA Run", () => {
    const outDir = createOutDir();
    const result = runCli([
      "run",
      "--project",
      validProjectDir,
      "--pr-context",
      prContextPath,
      "--out",
      outDir,
      "--mock-device-driver",
    ]);

    assert.equal(result.status, 0);
    assert.deepEqual(readdirSync(outDir), ["qa-report.json"]);

    const report = readReport(outDir);
    assert.equal(validateQaReport(report).ok, true);
    assert.equal(report.status, "passed");
  });

  it("classifies every public QA Status in reports and comments", () => {
    for (const status of ["passed", "failed", "blocked", "unsure"]) {
      const report = {
        status,
        summary: `${status} classification summary`,
        checksPerformed: [`Recorded ${status} classification`],
        issuesFound:
          status === "failed"
            ? [
                {
                  title: "Visible regression",
                  description: "The changed screen is visibly broken.",
                  severity: "high",
                },
              ]
            : [],
        screenshots:
          status === "unsure"
            ? []
            : [{ path: `artifacts/qa-agent/${status}.png` }],
      };

      assert.equal(validateQaReport(report).ok, true);
      assert.match(
        renderQaReportComment([{ platform: "android", report }]),
        new RegExp(`\\| Android \\| ${status[0].toUpperCase()}${status.slice(1)} \\|`),
      );
    }
  });

  it("preserves an unsure report when screenshot evidence is missing", () => {
    const outDir = createOutDir();
    const mockReportPath = path.join(outDir, "missing-evidence-unsure.json");
    writeJson(mockReportPath, {
      status: "unsure",
      summary: "The app launched, but no screenshot evidence was captured.",
      checksPerformed: ["Loaded PR Context", "Inspected mobile screen"],
      issuesFound: [],
      screenshots: [],
      diagnostics: ["Screenshot evidence was unavailable."],
    });

    const result = runCli([
      "run",
      "--project",
      validProjectDir,
      "--pr-context",
      prContextPath,
      "--out",
      outDir,
      "--mock-report",
      mockReportPath,
      "--mock-device-driver",
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Status: unsure/);

    const report = readReport(outDir);
    assert.equal(report.status, "unsure");
    assert.deepEqual(report.screenshots, []);
  });

  it("turns missing auth secrets into blocked reports without exposing values", () => {
    const outDir = createOutDir();
    const configPath = writeAuthConfig(outDir);
    const result = runCli(
      [
        "run",
        "--project",
        validProjectDir,
        "--config",
        configPath,
        "--pr-context",
        prContextPath,
        "--out",
        outDir,
        "--mock-device-driver",
      ],
      {
        QA_AGENT_LOGIN_EMAIL: "qa@example.com",
        QA_AGENT_LOGIN_PASSWORD: "",
      },
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Status: blocked/);

    const report = readReport(outDir);
    assert.equal(report.status, "blocked");
    assert.match(report.diagnostics.join("\n"), /QA_AGENT_LOGIN_PASSWORD/);
    assert.doesNotMatch(JSON.stringify(report), /qa@example\.com/);
  });

  it("refuses unsafe local-mode runtime actions before writing a passing report", () => {
    const outDir = createOutDir();
    const result = runCli([
      "run-local",
      "--project",
      validProjectDir,
      "--pr-context",
      prContextPath,
      "--out",
      outDir,
      "--mock-device-driver",
      "--mock-requested-action",
      "build_app",
    ]);

    assert.equal(result.status, 0);

    const report = readReport(outDir);
    assert.equal(report.status, "blocked");
    assert.match(report.diagnostics.join("\n"), /Local debug mode cannot run build_app/);
    assert.deepEqual(report.screenshots, []);
  });

  it("redacts secret-looking values from rendered reports", () => {
    const comment = renderQaReportComment([
      {
        platform: "android",
        report: {
          status: "blocked",
          summary: "Token ghp_1234567890abcdefghijklmnop was present in logs.",
          checksPerformed: ["Reviewed diagnostic output"],
          issuesFound: [],
          screenshots: [],
          diagnostics: ["password=super-secret-password"],
        },
      },
    ]);

    assert.doesNotMatch(comment, /ghp_1234567890abcdefghijklmnop/);
    assert.doesNotMatch(comment, /super-secret-password/);
    assert.match(comment, /\[REDACTED\]/);
  });
});
