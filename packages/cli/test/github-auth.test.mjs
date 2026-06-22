import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGitHubAppJwt } from "../dist/index.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(testDir, "../dist/cli.js");

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: path.resolve(testDir, "../../.."),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function writeConfig(projectDir) {
  writeFileSync(
    path.join(projectDir, "qa-agent.config.mjs"),
    `export default {
  targetPlatforms: ["android"],
  model: {
    provider: "openai",
    modelId: "gpt-4.1",
    apiKeyEnv: "QA_AGENT_MODEL_API_KEY",
  },
  app: {
    adapter: "expo-eas",
    easProjectId: "00000000-0000-0000-0000-000000000000",
    android: {
      applicationId: "com.example.qaagent",
    },
  },
  github: {
    auth: {
      type: "app",
      appIdEnv: "QA_AGENT_GITHUB_APP_ID",
      privateKeyEnv: "QA_AGENT_GITHUB_APP_PRIVATE_KEY",
      installationIdEnv: "QA_AGENT_GITHUB_APP_INSTALLATION_ID",
    },
  },
  screenshotStorage: {
    provider: "artifact",
    artifactsDir: "qa-agent/screenshots",
  },
  actionSafetyPolicy: {
    mode: "safe_only",
  },
  authProfiles: {},
};
`,
    "utf8",
  );
}

function writeFetchPreload(projectDir, logPath) {
  const preloadPath = path.join(projectDir, "mock-github-app-fetch.mjs");
  writeFileSync(
    preloadPath,
    `import { appendFileSync } from "node:fs";

globalThis.fetch = async (url, init = {}) => {
  const requestUrl = String(url);
  appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({
    url: requestUrl,
    authorization: init.headers?.authorization,
    method: init.method ?? "GET",
  }) + "\\n");

  if (requestUrl.endsWith("/app/installations/77/access_tokens")) {
    return new Response(JSON.stringify({ token: "installation-token" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }

  if (requestUrl.endsWith("/repos/owner/repo/pulls/42")) {
    return new Response(JSON.stringify({
      title: "Improve onboarding",
      body: "",
      base: { ref: "main" },
      head: { ref: "feature/onboarding" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (requestUrl.endsWith("/repos/owner/repo/issues/42")) {
    return new Response(JSON.stringify({ labels: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (requestUrl.endsWith("/repos/owner/repo/pulls/42/files?per_page=100")) {
    return new Response(JSON.stringify([{ filename: "app/index.tsx" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
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

describe("GitHub App auth", () => {
  it("creates a signed GitHub App JWT", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwt = createGitHubAppJwt({
      appId: "123",
      privateKey: privateKey.export({ type: "pkcs1", format: "pem" }),
      now: () => 1_700_000_000_000,
    });

    assert.equal(jwt.split(".").length, 3);
  });

  it("uses a GitHub App installation token for PR context", () => {
    const projectDir = mkdtempSync(path.join(tmpdir(), "qa-agent-github-app-"));
    const outPath = path.join(projectDir, "qa-agent", "pr-context.json");
    const fetchLogPath = path.join(projectDir, "fetch-log.jsonl");
    const preloadPath = writeFetchPreload(projectDir, fetchLogPath);
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    writeConfig(projectDir);

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
        QA_AGENT_GITHUB_APP_ID: "123",
        QA_AGENT_GITHUB_APP_PRIVATE_KEY: privateKey.export({
          type: "pkcs1",
          format: "pem",
        }),
        QA_AGENT_GITHUB_APP_INSTALLATION_ID: "77",
        NODE_OPTIONS: `--import=${pathToFileURL(preloadPath).href}`,
      },
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /GitHub PR Context written/);
    assert.equal(result.stderr, "");

    const context = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(context.repository, "owner/repo");

    const requests = readFileSync(fetchLogPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.match(requests[0].authorization, /^Bearer /);
    assert.notEqual(requests[0].authorization, "Bearer installation-token");
    assert.ok(
      requests
        .slice(1)
        .every((request) => request.authorization === "Bearer installation-token"),
    );
  });
});
