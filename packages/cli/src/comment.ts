import { readFile } from "node:fs/promises";
import { validateQaReport, type QaReport } from "./contracts.js";

export const QA_AGENT_COMMENT_MARKER = "<!-- qa-agent:report-comment:v1 -->";

export type PlatformReport = {
  platform: "android" | "ios";
  report: QaReport;
};

export type LoadPlatformReportInput = {
  platform: "android" | "ios";
  path: string;
};

export type GitHubComment = {
  id: number;
  body?: string | null;
};

export type GitHubCommentClient = {
  listComments(): Promise<GitHubComment[]>;
  createComment(body: string): Promise<GitHubComment>;
  updateComment(commentId: number, body: string): Promise<GitHubComment>;
};

export type UpsertQaReportCommentResult =
  | { action: "created"; comment: GitHubComment }
  | { action: "updated"; comment: GitHubComment };

export async function loadPlatformReport(
  input: LoadPlatformReportInput,
): Promise<PlatformReport> {
  const raw = await readFile(input.path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = validateQaReport(parsed);

  if (!result.ok) {
    throw new Error(
      `Invalid ${input.platform} QA Report at ${input.path}:\n${result.diagnostics
        .map((diagnostic) => `- ${diagnostic}`)
        .join("\n")}`,
    );
  }

  return {
    platform: input.platform,
    report: result.value,
  };
}

export function renderQaReportComment(reports: PlatformReport[]): string {
  if (reports.length === 0) {
    throw new Error("At least one QA Report is required.");
  }

  const sortedReports = [...reports].sort(
    (left, right) => platformOrder(left.platform) - platformOrder(right.platform),
  );

  return [
    QA_AGENT_COMMENT_MARKER,
    "## QA Agent Report",
    "",
    renderPlatformStatus(sortedReports),
    "",
    ...sortedReports.flatMap(renderPlatformReport),
  ].join("\n");
}

export async function upsertQaReportComment(
  client: GitHubCommentClient,
  body: string,
  marker = QA_AGENT_COMMENT_MARKER,
): Promise<UpsertQaReportCommentResult> {
  const existingComments = await client.listComments();
  const existingComment = existingComments.find((comment) =>
    hasDedicatedMarkerLine(comment.body, marker),
  );

  if (existingComment) {
    const comment = await client.updateComment(existingComment.id, body);
    return { action: "updated", comment };
  }

  const comment = await client.createComment(body);
  return { action: "created", comment };
}

export function createGitHubCommentClient(input: {
  repository: string;
  pullRequestNumber: number;
  token: string;
}): GitHubCommentClient {
  if (!/^[^/\s]+\/[^/\s]+$/.test(input.repository)) {
    throw new Error("GitHub repository must use owner/name format.");
  }

  const [owner, repo] = input.repository.split("/");
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${input.token}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
  };
  const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;

  return {
    async listComments() {
      const comments: GitHubComment[] = [];
      let nextUrl: string | undefined =
        `${baseUrl}/issues/${input.pullRequestNumber}/comments?per_page=100`;

      while (nextUrl) {
        const response = await fetch(nextUrl, { headers });
        comments.push(...(await parseGitHubResponse<GitHubComment[]>(response)));
        nextUrl = parseNextLink(response.headers.get("link"));
      }

      return comments;
    },
    async createComment(body) {
      const response = await fetch(
        `${baseUrl}/issues/${input.pullRequestNumber}/comments`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ body }),
        },
      );
      return await parseGitHubResponse<GitHubComment>(response);
    },
    async updateComment(commentId, body) {
      const response = await fetch(`${baseUrl}/issues/comments/${commentId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ body }),
      });
      return await parseGitHubResponse<GitHubComment>(response);
    },
  };
}

function hasDedicatedMarkerLine(
  body: string | null | undefined,
  marker: string,
): boolean {
  const firstNonEmptyLine = body
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstNonEmptyLine === marker;
}

function renderPlatformStatus(reports: PlatformReport[]): string {
  const rows = reports.map(
    ({ platform, report }) =>
      `| ${formatPlatform(platform)} | ${formatStatus(report.status)} |`,
  );

  return ["| Platform | Status |", "| --- | --- |", ...rows].join("\n");
}

function renderPlatformReport({ platform, report }: PlatformReport): string[] {
  return [
    `### ${formatPlatform(platform)}`,
    "",
    `**Status:** ${formatStatus(report.status)}`,
    "",
    "**Summary**",
    "",
    report.summary,
    "",
    "**Checks performed**",
    "",
    ...renderList(report.checksPerformed, "No checks were recorded."),
    "",
    "**Issues found**",
    "",
    ...renderIssues(report.issuesFound),
    "",
    "**Screenshots**",
    "",
    ...renderScreenshots(report.screenshots),
    "",
  ];
}

function renderList(items: string[], emptyMessage: string): string[] {
  if (items.length === 0) {
    return [`- ${emptyMessage}`];
  }

  return items.map((item) => `- ${item}`);
}

function renderIssues(issues: QaReport["issuesFound"]): string[] {
  if (issues.length === 0) {
    return ["- No issues found."];
  }

  return issues.map((issue) => {
    const severity = issue.severity ? ` (${issue.severity})` : "";
    return `- **${issue.title}**${severity}: ${issue.description}`;
  });
}

function renderScreenshots(screenshots: QaReport["screenshots"]): string[] {
  if (screenshots.length === 0) {
    return ["- No screenshots available."];
  }

  return screenshots.map((screenshot) => {
    const caption = screenshot.caption ? ` - ${screenshot.caption}` : "";
    return `- ${screenshot.path}${caption}`;
  });
}

function formatPlatform(platform: PlatformReport["platform"]): string {
  return platform === "android" ? "Android" : "iOS";
}

function formatStatus(status: QaReport["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function platformOrder(platform: PlatformReport["platform"]): number {
  return platform === "android" ? 0 : 1;
}

async function parseGitHubResponse<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `GitHub API request failed with ${response.status}: ${body || response.statusText}`,
    );
  }

  return JSON.parse(body) as T;
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
