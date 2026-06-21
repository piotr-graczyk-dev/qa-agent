import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  QA_AGENT_COMMENT_MARKER,
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
