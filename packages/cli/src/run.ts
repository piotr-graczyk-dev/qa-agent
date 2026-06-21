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
import {
  buildScreenshotPath,
  createAgentDeviceDriver,
  createMobileDeviceRuntimeTools,
  createMockMobileDeviceDriver,
  type MobileDeviceRuntimeTools,
  type MobileDeviceToolResult,
} from "./mobile-device-driver.js";

export type RunOptions = {
  configPath: string;
  outDir: string;
  platform: TargetPlatform;
  prContextPath: string;
  mockReportPath?: string;
  mockDeviceDriver?: boolean;
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
  outDir: string;
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

  const prContextInput = await readJsonFile(options.prContextPath, "PR Context");
  if (!prContextInput.ok) {
    return {
      ok: false,
      messages: [
        "QA Agent run found 1 PR Context issue.",
        `- ${prContextInput.error}`,
      ],
    };
  }

  const prContextResult = validatePrContext(prContextInput.value);
  if (!prContextResult.ok) {
    return {
      ok: false,
      messages: [
        `QA Agent run found ${prContextResult.diagnostics.length} PR Context issue${prContextResult.diagnostics.length === 1 ? "" : "s"}.`,
        ...prContextResult.diagnostics.map((diagnostic) => `- ${diagnostic}`),
      ],
    };
  }

  const driver = options.mockDeviceDriver
    ? createMockMobileDeviceDriver()
    : createAgentDeviceDriver({ platform: options.platform });
  const runtime = createFixtureEveRuntime(
    createMobileDeviceRuntimeTools(
      driver,
      configResult.config.actionSafetyPolicy,
    ),
    options.mockReportPath,
  );
  const report = await collectReportFromEveSession(runtime, {
    message: buildRunMessage(prContextResult.value, options.platform),
    prContext: prContextResult.value,
    platform: options.platform,
    outDir: options.outDir,
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
  tools: MobileDeviceRuntimeTools,
  mockReportPath: string | undefined,
): EveSessionRuntime {
  return {
    async *send(input) {
      yield eveEvent("session.started", { sessionId: "qa-agent-fixture-session" });
      yield eveEvent("turn.started", { platform: input.platform });
      yield eveEvent("message.received", { message: input.message });

      const screen = await tools.inspectUi({ interactiveOnly: true });
      yield eveEvent("action.result", {
        name: "inspect_ui",
        status: "completed",
        result: screen,
      });

      const screenshot = await tools.takeScreenshot({
        path: buildScreenshotPath(input.outDir, input.platform),
      });
      yield eveEvent("action.result", {
        name: "take_screenshot",
        status: "completed",
        result: screenshot,
      });

      const reportResult =
        mockReportPath === undefined
          ? { ok: true as const, value: defaultMockReport(input, screenshot) }
          : await readMockReport(mockReportPath);

      if (!reportResult.ok) {
        yield eveEvent("turn.failed", { message: reportResult.error });
      }

      if (reportResult.ok) {
        yield eveEvent("action.result", {
          name: "write_report",
          status: "completed",
          result: reportResult.value,
        });
      }

      yield eveEvent("turn.completed", { finishReason: "stop" });
      yield eveEvent("session.completed", { sessionId: "qa-agent-fixture-session" });
    },
  };
}

async function readMockReport(mockReportPath: string): Promise<ReadJsonResult> {
  return readJsonFile(mockReportPath, "mock write_report");
}

type ReadJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

async function readJsonFile(
  filePath: string,
  label: string,
): Promise<ReadJsonResult> {
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    return {
      ok: false,
      error: `Failed to read ${label} JSON: ${formatErrorMessage(error)}`,
    };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to parse ${label} JSON: ${formatErrorMessage(error)}`,
    };
  }
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

function defaultMockReport(
  input: EveSessionInput,
  screenshot: MobileDeviceToolResult,
): QaReport {
  return {
    status: "passed",
    summary: `Mocked ${input.platform} QA Run completed for PR #${input.prContext.pullRequestNumber}.`,
    checksPerformed: [
      "Loaded PR Context",
      "Inspected mobile screen through the Mobile Device Driver",
      "Captured screenshot evidence through the Mobile Device Driver",
    ],
    issuesFound: [],
    screenshots: [
      {
        path: readScreenshotPath(screenshot, input.outDir, input.platform),
        caption: "QA Agent mobile screenshot evidence",
      },
    ],
  };
}

function readScreenshotPath(
  screenshot: MobileDeviceToolResult,
  outDir: string,
  platform: TargetPlatform,
): string {
  if (!screenshot.ok) {
    return buildScreenshotPath(outDir, platform);
  }

  try {
    const parsed = JSON.parse(screenshot.result.stdout) as {
      path?: unknown;
      outPath?: unknown;
    };
    const candidate = parsed.path ?? parsed.outPath;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  } catch {
    return buildScreenshotPath(outDir, platform);
  }

  return buildScreenshotPath(outDir, platform);
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

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function eveEvent(
  type: HandleMessageStreamEvent["type"],
  data: unknown,
): HandleMessageStreamEvent {
  return { type, data } as HandleMessageStreamEvent;
}
