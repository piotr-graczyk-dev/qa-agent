import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(testDir, "../dist/cli.js");

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: path.resolve(testDir, "../../.."),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function writeFetchPreload(projectDir, logPath) {
  const preloadPath = path.join(projectDir, "mock-github-fetch.mjs");
  writeFileSync(
    preloadPath,
    `import { appendFileSync } from "node:fs";

globalThis.fetch = async (url, init = {}) => {
  const requestUrl = String(url);
  appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({
    url: requestUrl,
    authorization: init.headers?.authorization,
  }) + "\\n");

  if (requestUrl.endsWith("/repos/owner/repo/pulls/42")) {
    return new Response(JSON.stringify({
      title: "Improve onboarding",
      body: "Adds the new first-run checklist.",
      base: { ref: "main" },
      head: { ref: "feature/onboarding" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (requestUrl.endsWith("/repos/owner/repo/issues/42")) {
    return new Response(JSON.stringify({
      labels: [{ name: "mobile" }, { name: "expo" }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (requestUrl.endsWith("/repos/owner/repo/pulls/42/files?per_page=100")) {
    return new Response(JSON.stringify([
      { filename: "app/index.tsx", patch: "@@ source diff omitted" },
      { filename: "packages/cli/src/cli.ts" },
    ]), { status: 200, headers: { "content-type": "application/json" } });
  }

  return new Response(JSON.stringify({ message: "not found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
};
`,
    "utf8",
  );

  return preloadPath;
}

describe("qa-agent github-context", () => {
  it("writes minimal PR Context JSON through the CLI seam", async () => {
    const projectDir = mkdtempSync(path.join(tmpdir(), "qa-agent-github-context-"));
    const outPath = path.join(projectDir, "qa-agent", "pr-context.json");
    const fetchLogPath = path.join(projectDir, "fetch-log.jsonl");
    const preloadPath = writeFetchPreload(projectDir, fetchLogPath);

    const result = runCli(
      [
        "github-context",
        "--project",
        projectDir,
        "--repo",
        "owner/repo",
        "--pr",
        "42",
        "--out",
        "qa-agent/pr-context.json",
      ],
      {
        GITHUB_TOKEN: "github-token",
        NODE_OPTIONS: `--import=${pathToFileURL(preloadPath).href}`,
      },
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /GitHub PR Context written/);
    assert.match(result.stdout, /Changed files: 2/);
    assert.equal(result.stderr, "");

    const context = JSON.parse(readFileSync(outPath, "utf8"));
    assert.deepEqual(context, {
      provider: "github",
      repository: "owner/repo",
      pullRequestNumber: 42,
      title: "Improve onboarding",
      body: "Adds the new first-run checklist.",
      labels: ["mobile", "expo"],
      branchRefs: {
        base: "main",
        head: "feature/onboarding",
      },
      changedFilePaths: ["app/index.tsx", "packages/cli/src/cli.ts"],
    });
    assert.equal("diff" in context, false);
    assert.equal("patch" in context, false);

    const requests = readFileSync(fetchLogPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(requests.length, 3);
    assert.ok(
      requests.every(
        (request) => request.authorization === "Bearer github-token",
      ),
    );
  });

  it("requires a GitHub token before reading PR metadata", () => {
    const result = runCli([
      "github-context",
      "--repo",
      "owner/repo",
      "--pr",
      "42",
      "--out",
      "qa-agent/pr-context.json",
    ], { GITHUB_TOKEN: "" });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /GITHUB_TOKEN to be set, or pass --github-token/);
  });

  it("prints help for the command", () => {
    const result = runCli(["github-context", "--help"]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: qa-agent github-context/);
    assert.match(result.stdout, /does not include source diffs/);
    assert.equal(result.stderr, "");
  });
});
