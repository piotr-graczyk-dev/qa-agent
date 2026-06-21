import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
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
      path.join(testDir, "fixtures/reports/missing-report.json"),
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Status: blocked/);
    assert.equal(result.stderr, "");
    assert.deepEqual(readdirSync(outDir), ["qa-report.json"]);

    const report = readReport(outDir);
    assert.equal(report.status, "blocked");
    assert.match(report.diagnostics.join("\n"), /Expected exactly one write_report/);
    assert.match(report.diagnostics.join("\n"), /not provided/);
  });

  it("prints help for the run command", () => {
    const result = runCli(["run", "--help"]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: qa-agent run/);
    assert.match(result.stdout, /--pr-context <path>/);
    assert.equal(result.stderr, "");
  });
});
