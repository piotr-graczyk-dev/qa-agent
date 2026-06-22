import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  QA_AGENT_COMMENT_MARKER,
  createGitHubCommentClient,
  loadPlatformReport,
  renderQaReportComment,
  upsertQaReportComment,
} from "../dist/index.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(testDir, "../dist/cli.js");
const androidReportPath = path.join(
  testDir,
  "fixtures",
  "reports",
  "android-passed.json",
);
const iosReportPath = path.join(
  testDir,
  "fixtures",
  "reports",
  "ios-failed.json",
);
const blobScreenshotReportPath = path.join(
  testDir,
  "fixtures",
  "reports",
  "blob-screenshot.json",
);

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: path.resolve(testDir, "../../.."),
    encoding: "utf8",
  });
}

describe("QA Report comment rendering", () => {
  it("renders an Android-only QA Report comment from a fixture", async () => {
    const android = await loadPlatformReport({
      platform: "android",
      path: androidReportPath,
    });

    const comment = renderQaReportComment([android]);

    assert.match(comment, new RegExp(QA_AGENT_COMMENT_MARKER));
    assert.match(comment, /## QA Agent Report/);
    assert.match(comment, /\| Android \| Passed \|/);
    assert.match(comment, /The changed onboarding flow opened/);
    assert.match(comment, /Launched the Expo preview build/);
    assert.match(comment, /No issues found/);
    assert.match(comment, /artifacts\/android\/onboarding\.png/);
  });

  it("renders Android and iOS QA Reports in one readable comment", async () => {
    const android = await loadPlatformReport({
      platform: "android",
      path: androidReportPath,
    });
    const ios = await loadPlatformReport({
      platform: "ios",
      path: iosReportPath,
    });

    const comment = renderQaReportComment([ios, android]);

    assert.match(comment, /\| Android \| Passed \|/);
    assert.match(comment, /\| iOS \| Failed \|/);
    assert.ok(comment.indexOf("### Android") < comment.indexOf("### iOS"));
    assert.match(comment, /Continue button is hidden/);
    assert.match(comment, /artifacts\/ios\/onboarding-final\.png/);
  });

  it("prints the rendered comment through the CLI fixture path", () => {
    const result = runCli([
      "render-comment",
      "--android-report",
      androidReportPath,
      "--ios-report",
      iosReportPath,
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, new RegExp(QA_AGENT_COMMENT_MARKER));
    assert.match(result.stdout, /\| Android \| Passed \|/);
    assert.match(result.stdout, /\| iOS \| Failed \|/);
    assert.equal(result.stderr, "");
  });

  it("prints an iOS-only QA Report comment through the CLI fixture path", () => {
    const result = runCli(["render-comment", "--ios-report", iosReportPath]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, new RegExp(QA_AGENT_COMMENT_MARKER));
    assert.match(result.stdout, /\| iOS \| Failed \|/);
    assert.match(result.stdout, /Continue button is hidden/);
    assert.doesNotMatch(result.stdout, /\| Android \|/);
    assert.equal(result.stderr, "");
  });

  it("requires at least one platform report before rendering", () => {
    const result = runCli(["render-comment"]);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /requires --android-report <path>, --ios-report <path>, or both/);
  });

  it("renders screenshot storage metadata as inline links when available", async () => {
    const android = await loadPlatformReport({
      platform: "android",
      path: blobScreenshotReportPath,
    });

    const comment = renderQaReportComment([android]);

    assert.match(
      comment,
      /\[screenshots\/android\/onboarding\.png\]\(https:\/\/example\.public\.blob\.vercel-storage\.com\/screenshots\/android\/onboarding\.png\)/,
    );
    assert.match(comment, /Android onboarding state/);
  });

  it("requires complete GitHub target options before upserting", () => {
    const result = runCli([
      "render-comment",
      "--android-report",
      androidReportPath,
      "--repo",
      "piotr-graczyk-dev/qa-agent",
    ]);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /requires both --repo and --pr/);
  });
});

describe("QA Report comment upsert", () => {
  it("updates the existing marked QA Agent comment", async () => {
    const calls = [];
    const client = {
      async listComments() {
        calls.push(["list"]);
        return [
          { id: 1, body: "Unrelated reviewer comment" },
          { id: 2, body: `${QA_AGENT_COMMENT_MARKER}\nOld report` },
        ];
      },
      async createComment(body) {
        calls.push(["create", body]);
        return { id: 3, body };
      },
      async updateComment(commentId, body) {
        calls.push(["update", commentId, body]);
        return { id: commentId, body };
      },
    };

    const result = await upsertQaReportComment(client, "new report body");

    assert.equal(result.action, "updated");
    assert.deepEqual(calls, [
      ["list"],
      ["update", 2, "new report body"],
    ]);
  });

  it("ignores marker text that is not the first non-empty marker line", async () => {
    const calls = [];
    const client = {
      async listComments() {
        calls.push(["list"]);
        return [
          {
            id: 1,
            body: `Unrelated reviewer comment\n${QA_AGENT_COMMENT_MARKER}`,
          },
          { id: 2, body: `\n\n${QA_AGENT_COMMENT_MARKER}\nOld report` },
        ];
      },
      async createComment(body) {
        calls.push(["create", body]);
        return { id: 3, body };
      },
      async updateComment(commentId, body) {
        calls.push(["update", commentId, body]);
        return { id: commentId, body };
      },
    };

    const result = await upsertQaReportComment(client, "new report body");

    assert.equal(result.action, "updated");
    assert.deepEqual(calls, [
      ["list"],
      ["update", 2, "new report body"],
    ]);
  });

  it("creates a QA Agent comment when no marked comment exists", async () => {
    const calls = [];
    const client = {
      async listComments() {
        calls.push(["list"]);
        return [{ id: 1, body: "Unrelated reviewer comment" }];
      },
      async createComment(body) {
        calls.push(["create", body]);
        return { id: 2, body };
      },
      async updateComment(commentId, body) {
        calls.push(["update", commentId, body]);
        return { id: commentId, body };
      },
    };

    const result = await upsertQaReportComment(client, "new report body");

    assert.equal(result.action, "created");
    assert.deepEqual(calls, [
      ["list"],
      ["create", "new report body"],
    ]);
  });
});

describe("GitHub comment client", () => {
  it("rejects repository values that are not exactly owner/name", () => {
    assert.throws(
      () =>
        createGitHubCommentClient({
          repository: "owner/repo/extra",
          pullRequestNumber: 23,
          token: "token",
        }),
      /owner\/name/,
    );
  });

  it("fetches all paginated issue comment pages", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls = [];

    globalThis.fetch = async (url) => {
      const requestUrl = String(url);
      requestedUrls.push(requestUrl);

      if (requestUrl.includes("page=2")) {
        return new Response(JSON.stringify([{ id: 2, body: "second page" }]), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      }

      return new Response(JSON.stringify([{ id: 1, body: "first page" }]), {
        status: 200,
        headers: {
          "content-type": "application/json",
          link: '<https://api.github.com/repos/owner/repo/issues/23/comments?per_page=100&page=2>; rel="next"',
        },
      });
    };

    try {
      const client = createGitHubCommentClient({
        repository: "owner/repo",
        pullRequestNumber: 23,
        token: "token",
      });

      const comments = await client.listComments();

      assert.deepEqual(comments, [
        { id: 1, body: "first page" },
        { id: 2, body: "second page" },
      ]);
      assert.equal(requestedUrls.length, 2);
      assert.match(requestedUrls[0], /per_page=100/);
      assert.match(requestedUrls[1], /page=2/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
