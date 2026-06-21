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
    comment.body?.includes(marker),
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
  const [owner, repo] = input.repository.split("/");
  if (!owner || !repo) {
    throw new Error("GitHub repository must use owner/name format.");
  }

  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${input.token}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
  };
  const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;

  return {
    async listComments() {
      const response = await fetch(
        `${baseUrl}/issues/${input.pullRequestNumber}/comments`,
        { headers },
      );
      return await parseGitHubResponse<GitHubComment[]>(response);
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
