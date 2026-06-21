import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  qaReportOrBlocked,
  validatePrContext,
  validateQaReport,
} from "../dist/index.js";

const validReport = {
  status: "passed",
  summary: "The changed onboarding flow opened and rendered successfully.",
  checksPerformed: ["Opened the app", "Inspected onboarding screen"],
  issuesFound: [],
  screenshots: [{ path: "artifacts/screenshots/onboarding.png" }],
};

const minimalPrContext = {
  provider: "github",
  repository: "piotr-graczyk-dev/qa-agent",
  pullRequestNumber: 20,
  title: "Add CLI config foundation",
  body: "Introduces the first QA Agent CLI config contract.",
  labels: ["enhancement", "mobile"],
  branchRefs: {
    base: "main",
    head: "codex/issue-7-cli-config-foundation",
  },
  changedFilePaths: [
    "packages/cli/src/config.ts",
    "packages/cli/test/doctor.test.mjs",
  ],
};

describe("QA Report contract", () => {
  it("accepts a valid report", () => {
    const result = validateQaReport(validReport);

    assert.equal(result.ok, true);
    assert.equal(result.value.status, "passed");
    assert.deepEqual(result.value.issuesFound, []);
  });

  it("accepts screenshot storage metadata on a QA Report", () => {
    const result = validateQaReport({
      ...validReport,
      screenshots: [
        {
          path: "screenshots/android/onboarding.png",
          caption: "Onboarding screen",
          storage: {
            provider: "vercel-blob",
            url: "https://example.public.blob.vercel-storage.com/screenshots/android/onboarding.png",
          },
        },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.value.screenshots[0].storage.provider, "vercel-blob");
  });

  it("accepts every QA Status", () => {
    for (const status of ["passed", "failed", "blocked", "unsure"]) {
      const result = validateQaReport({
        ...validReport,
        status,
        summary: `${status} report summary`,
      });

      assert.equal(result.ok, true);
      assert.equal(result.value.status, status);
    }
  });

  it("rejects invalid reports", () => {
    const result = validateQaReport({
      ...validReport,
      status: "skipped",
      summary: "",
    });

    assert.equal(result.ok, false);
    assert.match(result.diagnostics.join("\n"), /status/);
    assert.match(result.diagnostics.join("\n"), /summary/);
  });

  it("converts an invalid report into a blocked report with diagnostics", () => {
    const report = qaReportOrBlocked(
      { ...validReport, status: "skipped" },
      ["", "  ", " write_report returned an invalid payload. "],
    );

    assert.equal(report.status, "blocked");
    assert.equal(report.checksPerformed.length, 0);
    assert.ok(report.diagnostics.every((diagnostic) => diagnostic.trim()));
    assert.equal(
      report.diagnostics[0],
      "write_report returned an invalid payload.",
    );
    assert.match(report.diagnostics.join("\n"), /status/);
  });

  it("converts a missing report into a blocked report with diagnostics", () => {
    const report = qaReportOrBlocked(undefined);

    assert.equal(report.status, "blocked");
    assert.match(report.summary, /could not produce a valid QA Report/);
    assert.match(report.diagnostics.join("\n"), /not provided/);
  });
});

describe("PR Context contract", () => {
  it("accepts minimal PR Context JSON without source diffs", () => {
    const result = validatePrContext(minimalPrContext);

    assert.equal(result.ok, true);
    assert.equal(result.value.provider, "github");
    assert.equal(result.value.repository, "piotr-graczyk-dev/qa-agent");
    assert.deepEqual(result.value.changedFilePaths, [
      "packages/cli/src/config.ts",
      "packages/cli/test/doctor.test.mjs",
    ]);
    assert.equal("diff" in result.value, false);
    assert.equal("patch" in result.value, false);
  });

  it("rejects full source diff fields by default", () => {
    const result = validatePrContext({
      ...minimalPrContext,
      diff: "diff --git a/packages/cli/src/config.ts b/packages/cli/src/config.ts",
    });

    assert.equal(result.ok, false);
    assert.match(result.diagnostics.join("\n"), /Unrecognized key/);
  });
});
