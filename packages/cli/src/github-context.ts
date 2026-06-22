import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validatePrContext, type PrContext } from "./contracts.js";

export type GitHubContextOptions = {
  repository: string;
  pullRequestNumber: number;
  outPath: string;
  token: string;
  apiBaseUrl?: string;
};

export type GitHubContextResult =
  | { ok: true; prContext: PrContext; outPath: string; messages: string[] }
  | { ok: false; messages: string[] };

type GitHubPullRequestResponse = {
  title?: unknown;
  body?: unknown;
  base?: { ref?: unknown };
  head?: { ref?: unknown };
};

type GitHubIssueResponse = {
  labels?: unknown;
};

type GitHubPullRequestFileResponse = {
  filename?: unknown;
};

export async function writeGitHubPrContext(
  options: GitHubContextOptions,
): Promise<GitHubContextResult> {
  const client = createGitHubPrContextClient(options);
  const rawContext = await client.loadPullRequestContext();
  const result = validatePrContext(rawContext);

  if (!result.ok) {
    return {
      ok: false,
      messages: [
        `GitHub PR Context is invalid for ${options.repository}#${options.pullRequestNumber}.`,
        ...result.diagnostics.map((diagnostic) => `- ${diagnostic}`),
      ],
    };
  }

  const outPath = path.resolve(options.outPath);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(result.value, null, 2)}\n`);

  return {
    ok: true,
    prContext: result.value,
    outPath,
    messages: [
      "GitHub PR Context written.",
      `- Repository: ${result.value.repository}`,
      `- Pull request: #${result.value.pullRequestNumber}`,
      `- Changed files: ${result.value.changedFilePaths.length}`,
      `- Output: ${outPath}`,
    ],
  };
}

export function createGitHubPrContextClient(input: {
  repository: string;
  pullRequestNumber: number;
  token: string;
  apiBaseUrl?: string;
  fetch?: typeof fetch;
}): { loadPullRequestContext(): Promise<unknown> } {
  if (!/^[^/\s]+\/[^/\s]+$/.test(input.repository)) {
    throw new Error("GitHub repository must use owner/name format.");
  }

  const [owner, repo] = input.repository.split("/");
  const apiBaseUrl = (input.apiBaseUrl ?? "https://api.github.com").replace(
    /\/+$/,
    "",
  );
  const request = input.fetch ?? fetch;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${input.token}`,
    "x-github-api-version": "2022-11-28",
  };

  async function requestJson<T>(url: string): Promise<T> {
    const response = await request(url, { headers });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `GitHub API request failed with ${response.status}: ${body || response.statusText}`,
      );
    }

    return JSON.parse(body) as T;
  }

  async function requestAllPages<T>(firstUrl: string): Promise<T[]> {
    const values: T[] = [];
    let nextUrl: string | undefined = firstUrl;

    while (nextUrl) {
      const response = await request(nextUrl, { headers });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(
          `GitHub API request failed with ${response.status}: ${body || response.statusText}`,
        );
      }

      values.push(...(JSON.parse(body) as T[]));
      nextUrl = parseNextLink(response.headers.get("link"));
    }

    return values;
  }

  return {
    async loadPullRequestContext() {
      const prUrl = `${apiBaseUrl}/repos/${owner}/${repo}/pulls/${input.pullRequestNumber}`;
      const issueUrl = `${apiBaseUrl}/repos/${owner}/${repo}/issues/${input.pullRequestNumber}`;
      const filesUrl = `${apiBaseUrl}/repos/${owner}/${repo}/pulls/${input.pullRequestNumber}/files?per_page=100`;
      const [pullRequest, issue, files] = await Promise.all([
        requestJson<GitHubPullRequestResponse>(prUrl),
        requestJson<GitHubIssueResponse>(issueUrl),
        requestAllPages<GitHubPullRequestFileResponse>(filesUrl),
      ]);

      return {
        provider: "github",
        repository: input.repository,
        pullRequestNumber: input.pullRequestNumber,
        title: readString(pullRequest.title),
        body: readString(pullRequest.body),
        labels: readLabels(issue.labels),
        branchRefs: {
          base: readString(pullRequest.base?.ref),
          head: readString(pullRequest.head?.ref),
        },
        changedFilePaths: files.map((file) => readString(file.filename)),
      };
    },
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readLabels(labels: unknown): string[] {
  if (!Array.isArray(labels)) {
    return [];
  }

  return labels
    .map((label) => {
      if (typeof label === "string") {
        return label;
      }

      if (label && typeof label === "object" && "name" in label) {
        const name = (label as { name?: unknown }).name;
        return typeof name === "string" ? name : "";
      }

      return "";
    })
    .filter(Boolean);
}

function parseNextLink(linkHeader: string | null): string | undefined {
  if (!linkHeader) {
    return undefined;
  }

  for (const link of linkHeader.split(",")) {
    const match = link.match(/^\s*<([^>]+)>;\s*rel="([^"]+)"\s*$/);
    if (match?.[2] === "next") {
      return match[1];
    }
  }

  return undefined;
}
