import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(testDir, "../src/cli.ts");

function runCli(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", cliPath, ...args], {
    cwd: path.resolve(testDir, "../../.."),
    encoding: "utf8",
  });
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
    assert.equal(result.stderr, "");
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
