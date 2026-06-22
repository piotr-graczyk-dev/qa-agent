import { createSign } from "node:crypto";
import type { GitHubAuth } from "./config.js";

export type ResolveGitHubTokenInput = {
  explicitToken?: string;
  auth?: GitHubAuth;
  apiBaseUrl?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => number;
};

export type ResolveGitHubTokenResult =
  | { ok: true; token: string; source: "explicit" | "env" | "github-app" }
  | { ok: false; message: string };

type GitHubAppInstallationTokenResponse = {
  token?: unknown;
};

export async function resolveGitHubToken(
  input: ResolveGitHubTokenInput,
): Promise<ResolveGitHubTokenResult> {
  const explicitToken = input.explicitToken?.trim();
  if (explicitToken) {
    return { ok: true, token: explicitToken, source: "explicit" };
  }

  const auth = input.auth ?? { type: "token", tokenEnv: "GITHUB_TOKEN" };
  const env = input.env ?? process.env;

  if (auth.type === "token") {
    const token = env[auth.tokenEnv]?.trim();
    if (!token) {
      return {
        ok: false,
        message: `GitHub token auth requires ${auth.tokenEnv} to be set, or pass --github-token.`,
      };
    }

    return { ok: true, token, source: "env" };
  }

  return await createGitHubAppInstallationToken({
    appId: readRequiredEnv(env, auth.appIdEnv),
    privateKey: readRequiredEnv(env, auth.privateKeyEnv),
    installationId: readRequiredEnv(env, auth.installationIdEnv),
    apiBaseUrl: input.apiBaseUrl,
    fetch: input.fetch,
    now: input.now,
  });
}

export async function createGitHubAppInstallationToken(input: {
  appId: string | undefined;
  privateKey: string | undefined;
  installationId: string | undefined;
  apiBaseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
}): Promise<ResolveGitHubTokenResult> {
  const missing = [
    ["QA Agent GitHub App id", input.appId],
    ["QA Agent GitHub App private key", input.privateKey],
    ["QA Agent GitHub App installation id", input.installationId],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([label]) => label);

  if (missing.length > 0) {
    return {
      ok: false,
      message: `GitHub App auth is missing: ${missing.join(", ")}.`,
    };
  }

  const appId = input.appId?.trim() ?? "";
  const installationId = input.installationId?.trim() ?? "";
  const privateKey = normalizePrivateKey(input.privateKey ?? "");
  const jwt = createGitHubAppJwt({
    appId,
    privateKey,
    now: input.now,
  });
  const apiBaseUrl = (input.apiBaseUrl ?? "https://api.github.com").replace(
    /\/+$/,
    "",
  );
  const request = input.fetch ?? fetch;
  const response = await request(
    `${apiBaseUrl}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt}`,
        "x-github-api-version": "2022-11-28",
      },
    },
  );
  const body = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      message: `GitHub App installation token request failed with ${response.status}: ${body || response.statusText}`,
    };
  }

  const parsed = JSON.parse(body) as GitHubAppInstallationTokenResponse;
  if (typeof parsed.token !== "string" || !parsed.token.trim()) {
    return {
      ok: false,
      message: "GitHub App installation token response did not include a token.",
    };
  }

  return { ok: true, token: parsed.token, source: "github-app" };
}

export function createGitHubAppJwt(input: {
  appId: string;
  privateKey: string;
  now?: () => number;
}): string {
  const nowSeconds = Math.floor((input.now?.() ?? Date.now()) / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: nowSeconds - 60,
    exp: nowSeconds + 600,
    iss: input.appId,
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .end()
    .sign(input.privateKey);

  return `${signingInput}.${base64Url(signature)}`;
}

export function readGitHubAuthEnvNames(auth: GitHubAuth): string[] {
  if (auth.type === "token") {
    return [auth.tokenEnv];
  }

  return [auth.appIdEnv, auth.privateKeyEnv, auth.installationIdEnv];
}

function readRequiredEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  return env[name]?.trim();
}

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("-----BEGIN")) {
    return trimmed.replaceAll("\\n", "\n");
  }

  try {
    return Buffer.from(trimmed, "base64").toString("utf8").trim();
  } catch {
    return trimmed;
  }
}

function base64UrlJson(value: unknown): string {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function base64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
