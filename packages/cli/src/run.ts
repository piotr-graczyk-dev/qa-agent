import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HandleMessageStreamEvent } from "eve/client";
import { loadQaAgentConfig, type TargetPlatform } from "./config.js";
import {
  qaReportOrBlocked,
  validatePrContext,
  validateQaReport,
  type PrContext,
  type QaReport,
} from "./contracts.js";

export type RunOptions = {
  configPath: string;
  outDir: string;
  platform: TargetPlatform;
  prContextPath: string;
  mockReportPath?: string;
};

export type RunResult =
  | { ok: true; report: QaReport; reportPath: string; messages: string[] }
  | { ok: false; report?: QaReport; reportPath?: string; messages: string[] };

type EveSessionRuntime = {
  send(input: EveSessionInput): AsyncIterable<HandleMessageStreamEvent>;
};

type EveSessionInput = {
  message: string;
  prContext: PrContext;
  platform: TargetPlatform;
};

type MockMobileDeviceDriver = {
  inspectScreen(): Promise<{ screenName: string; visibleText: string[] }>;
  takeScreenshot(): Promise<{ path: string; caption: string }>;
};

export async function runQaAgent(options: RunOptions): Promise<RunResult> {
  const configResult = await loadQaAgentConfig(options.configPath);
  if (!configResult.ok) {
    return {
      ok: false,
      messages: [
        `QA Agent run found ${configResult.errors.length} configuration issue${configResult.errors.length === 1 ? "" : "s"}.`,
        ...configResult.errors.map((error) => `- ${error}`),
      ],
    };
  }

  if (!configResult.config.targetPlatforms.includes(options.platform)) {
    return {
      ok: false,
      messages: [
        `QA Agent run cannot target ${options.platform}; configured platforms: ${configResult.config.targetPlatforms.join(", ")}.`,
      ],
    };
  }

  const prContextResult = validatePrContext(
    JSON.parse(await readFile(options.prContextPath, "utf8")),
  );
  if (!prContextResult.ok) {
    return {
      ok: false,
      messages: [
        `QA Agent run found ${prContextResult.diagnostics.length} PR Context issue${prContextResult.diagnostics.length === 1 ? "" : "s"}.`,
        ...prContextResult.diagnostics.map((diagnostic) => `- ${diagnostic}`),
      ],
    };
  }

  const driver = createMockMobileDeviceDriver();
  const runtime = createFixtureEveRuntime(driver, options.mockReportPath);
  const report = await collectReportFromEveSession(runtime, {
    message: buildRunMessage(prContextResult.value, options.platform),
    prContext: prContextResult.value,
    platform: options.platform,
  });

  const reportPath = path.join(options.outDir, "qa-report.json");
  await mkdir(options.outDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  return {
    ok: true,
    report,
    reportPath,
    messages: [
      "QA Agent run completed.",
      `- Platform: ${options.platform}`,
      `- Status: ${report.status}`,
      `- QA Report: ${reportPath}`,
    ],
  };
}

function createFixtureEveRuntime(
  driver: MockMobileDeviceDriver,
  mockReportPath: string | undefined,
): EveSessionRuntime {
  return {
    async *send(input) {
      yield eveEvent("session.started", { sessionId: "qa-agent-fixture-session" });
      yield eveEvent("turn.started", { platform: input.platform });
      yield eveEvent("message.received", { message: input.message });

      const screen = await driver.inspectScreen();
      yield eveEvent("action.result", {
        name: "inspect_screen",
        status: "completed",
        result: screen,
      });

      const screenshot = await driver.takeScreenshot();
      yield eveEvent("action.result", {
        name: "take_screenshot",
        status: "completed",
        result: screenshot,
      });

      const report =
        mockReportPath === undefined
          ? defaultMockReport(input, screenshot)
          : await readMockReport(mockReportPath);

      if (report !== undefined) {
        yield eveEvent("action.result", {
          name: "write_report",
          status: "completed",
          result: report,
        });
      }

      yield eveEvent("turn.completed", { finishReason: "stop" });
      yield eveEvent("session.completed", { sessionId: "qa-agent-fixture-session" });
    },
  };
}

async function readMockReport(mockReportPath: string): Promise<unknown> {
  const raw = await readFile(mockReportPath, "utf8");
  if (raw.trim() === "") {
    return undefined;
  }

  return JSON.parse(raw);
}

async function collectReportFromEveSession(
  runtime: EveSessionRuntime,
  input: EveSessionInput,
): Promise<QaReport> {
  const diagnostics: string[] = [];
  const writeReports: unknown[] = [];

  for await (const event of runtime.send(input)) {
    if (event.type === "turn.failed" || event.type === "session.failed") {
      diagnostics.push(readFailureMessage(event.data));
    }

    if (event.type !== "action.result") {
      continue;
    }

    const action = event.data as { name?: string; result?: unknown };
    if (action.name === "write_report") {
      writeReports.push(action.result);
    }
  }

  if (writeReports.length !== 1) {
    return qaReportOrBlocked(undefined, [
      `Expected exactly one write_report result, received ${writeReports.length}.`,
      ...diagnostics,
    ]);
  }

  const reportResult = validateQaReport(writeReports[0]);
  if (!reportResult.ok) {
    return qaReportOrBlocked(writeReports[0], [
      "write_report returned an invalid payload.",
      ...diagnostics,
    ]);
  }

  return reportResult.value;
}

function createMockMobileDeviceDriver(): MockMobileDeviceDriver {
  return {
    async inspectScreen() {
      return {
        screenName: "FixtureHome",
        visibleText: ["Welcome", "Start learning", "Profile"],
      };
    },
    async takeScreenshot() {
      return {
        path: "artifacts/screenshots/fixture-home.png",
        caption: "Mocked fixture home screen",
      };
    },
  };
}

function defaultMockReport(
  input: EveSessionInput,
  screenshot: { path: string; caption: string },
): QaReport {
  return {
    status: "passed",
    summary: `Mocked ${input.platform} QA Run completed for PR #${input.prContext.pullRequestNumber}.`,
    checksPerformed: [
      "Loaded PR Context",
      "Inspected mocked mobile screen",
      "Captured mocked screenshot evidence",
    ],
    issuesFound: [],
    screenshots: [screenshot],
  };
}

function buildRunMessage(prContext: PrContext, platform: TargetPlatform): string {
  return [
    `Run a black-box QA pass for ${platform}.`,
    `Repository: ${prContext.repository}`,
    `Pull request: #${prContext.pullRequestNumber} ${prContext.title}`,
    "Finish by calling write_report exactly once.",
  ].join("\n");
}

function readFailureMessage(data: unknown): string {
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "Eve runtime reported a failed session event.";
}

function eveEvent(
  type: HandleMessageStreamEvent["type"],
  data: unknown,
): HandleMessageStreamEvent {
  return { type, data } as HandleMessageStreamEvent;
}
