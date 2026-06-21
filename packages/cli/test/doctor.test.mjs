import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(testDir, "../dist/cli.js");

function runCli(args) {
  return runCliWithEnv(args, fakeAgentDeviceEnv());
}

function runCliWithoutAgentDevice(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: path.resolve(testDir, "../../.."),
    encoding: "utf8",
    env: { PATH: "" },
  });
}

function runCliWithEnv(args, env) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: path.resolve(testDir, "../../.."),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function fakeAgentDeviceEnv(extraEnv = {}) {
  const binDir = mkdtempSync(path.join(tmpdir(), "qa-agent-agent-device-"));
  const binPath = path.join(binDir, "agent-device");
  writeFileSync(
    binPath,
    "#!/usr/bin/env bash\nif [[ \"$1\" == \"--version\" ]]; then echo \"0.17.5\"; exit 0; fi\necho \"fake agent-device\" >&2\nexit 1\n",
    "utf8",
  );
  chmodSync(binPath, 0o755);

  return {
    ...extraEnv,
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };
}

describe("qa-agent doctor", () => {
  it("reports success for a minimal valid config", () => {
    const result = runCli([
      "doctor",
      "--project",
      path.join(testDir, "fixtures/valid"),
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /QA Agent doctor passed/);
    assert.match(result.stdout, /App adapter: expo-eas/);
    assert.match(result.stdout, /Target platforms: android/);
    assert.match(result.stdout, /Screenshot storage: artifact/);
    assert.equal(result.stderr, "");
  });

  it("defaults screenshot storage to artifact without third-party credentials", () => {
    const result = runCli([
      "doctor",
      "--project",
      path.join(testDir, "fixtures/default-artifact-storage"),
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /QA Agent doctor passed/);
    assert.match(result.stdout, /Screenshot storage: artifact/);
    assert.equal(result.stderr, "");
  });

  it("accepts Vercel Blob storage when the configured credential exists", () => {
    const result = runCliWithEnv(
      [
        "doctor",
        "--project",
        path.join(testDir, "fixtures/vercel-blob-storage"),
      ],
      fakeAgentDeviceEnv({ QA_AGENT_BLOB_TOKEN: "blob-token" }),
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Screenshot storage: vercel-blob/);
    assert.equal(result.stderr, "");
  });

  it("reports a clear doctor failure when Vercel Blob credentials are missing", () => {
    const result = runCliWithEnv(
      [
        "doctor",
        "--project",
        path.join(testDir, "fixtures/vercel-blob-storage"),
      ],
      fakeAgentDeviceEnv({ QA_AGENT_BLOB_TOKEN: "" }),
    );

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /environment issue/);
    assert.match(result.stderr, /Vercel Blob storage requires QA_AGENT_BLOB_TOKEN/);
  });

  it("reports a clear doctor failure when agent-device is missing", () => {
    const result = runCliWithoutAgentDevice([
      "doctor",
      "--project",
      path.join(testDir, "fixtures/valid"),
    ]);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /environment issue/);
    assert.match(result.stderr, /agent-device is not available/);
  });

  it("reports invalid Vercel Blob storage configuration", () => {
    const result = runCli([
      "doctor",
      "--project",
      path.join(testDir, "fixtures/invalid-blob-storage"),
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /configuration issue/);
    assert.match(result.stderr, /screenshotStorage\.tokenEnv/);
  });

  it("reports a clear failure for missing model configuration", () => {
    const result = runCli([
      "doctor",
      "--project",
      path.join(testDir, "fixtures/missing-model"),
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /configuration issue/);
    assert.match(result.stderr, /model: model configuration is required/);
  });

  it("reports a clear failure for missing app configuration", () => {
    const result = runCli([
      "doctor",
      "--project",
      path.join(testDir, "fixtures/missing-app"),
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /configuration issue/);
    assert.match(result.stderr, /app: app configuration is required/);
  });

  it("prints help for the implemented command", () => {
    const result = runCli(["doctor", "--help"]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: qa-agent doctor/);
    assert.match(result.stdout, /--project <dir>/);
    assert.equal(result.stderr, "");
  });
});
