import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HandleMessageStreamEvent } from "eve/client";
import {
  createAuthProfileRedactor,
  createAuthRuntimeTools,
  type AuthRuntimeTools,
  type LoginWithProfileResult,
} from "./auth-profiles.js";
import {
  loadQaAgentConfig,
  type ScreenshotStorage,
  type TargetPlatform,
} from "./config.js";
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
import { redactJsonValue, type SecretRedactor } from "./redaction.js";

type SuccessfulMobileDeviceToolResult = Extract<
  MobileDeviceToolResult,
  { ok: true }
>;

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
  const redactor = createAuthProfileRedactor(configResult.config.authProfiles);
  const authProfileName = Object.keys(configResult.config.authProfiles)[0];
  const runtime = createFixtureEveRuntime(
    createMobileDeviceRuntimeTools(
      driver,
      configResult.config.actionSafetyPolicy,
    ),
    createAuthRuntimeTools({
      profiles: configResult.config.authProfiles,
      driver,
      policy: configResult.config.actionSafetyPolicy,
    }),
    authProfileName,
    options.mockReportPath,
    redactor,
    configResult.config.screenshotStorage,
  );
  const report = await collectReportFromEveSession(
    runtime,
    {
      message: buildRunMessage(prContextResult.value, options.platform),
      prContext: prContextResult.value,
      platform: options.platform,
      outDir: options.outDir,
    },
    redactor,
  );

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
  authTools: AuthRuntimeTools,
  authProfileName: string | undefined,
  mockReportPath: string | undefined,
  redactor: SecretRedactor,
  screenshotStorage: ScreenshotStorage,
): EveSessionRuntime {
  return {
    async *send(input) {
      yield eveEvent("session.started", { sessionId: "qa-agent-fixture-session" });
      yield eveEvent("turn.started", { platform: input.platform });
      yield eveEvent("message.received", { message: input.message });

      let login: LoginWithProfileResult | undefined;
      if (authProfileName) {
        login = await authTools.loginWithProfile({ profileName: authProfileName });
        yield eveEvent("action.result", {
          name: "login_with_profile",
          status: login.ok ? "completed" : "failed",
          result: redactJsonValue(login, redactor),
        });
        if (!login.ok) {
          yield eveEvent("turn.failed", {
            message: login.reason,
            diagnostics: login.diagnostics,
          });
          yield eveEvent("turn.completed", { finishReason: "tool_failed" });
          yield eveEvent("session.completed", {
            sessionId: "qa-agent-fixture-session",
          });
          return;
        }
      }

      const screen = await tools.inspectUi({ interactiveOnly: true });
      yield eveEvent("action.result", {
        name: "inspect_ui",
        status: screen.ok ? "completed" : "failed",
        result: screen,
      });
      if (!screen.ok) {
        yield toolFailureEvent("inspect_ui", screen);
        yield eveEvent("turn.completed", { finishReason: "tool_failed" });
        yield eveEvent("session.completed", {
          sessionId: "qa-agent-fixture-session",
        });
        return;
      }

      const screenshot = await tools.takeScreenshot({
        path: buildScreenshotPath(input.outDir, input.platform),
      });
      yield eveEvent("action.result", {
        name: "take_screenshot",
        status: screenshot.ok ? "completed" : "failed",
        result: screenshot,
      });
      if (!screenshot.ok) {
        yield toolFailureEvent("take_screenshot", screenshot);
        yield eveEvent("turn.completed", { finishReason: "tool_failed" });
        yield eveEvent("session.completed", {
          sessionId: "qa-agent-fixture-session",
        });
        return;
      }

      const reportResult =
        mockReportPath === undefined
          ? {
              ok: true as const,
              value: defaultMockReport(
                input,
                screenshot,
                Boolean(login?.ok),
                screenshotStorage,
              ),
            }
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
  redactor: SecretRedactor,
): Promise<QaReport> {
  const diagnostics: string[] = [];
  const writeReports: unknown[] = [];

  for await (const event of runtime.send(input)) {
    if (event.type === "turn.failed" || event.type === "session.failed") {
      diagnostics.push(redactor(readFailureMessage(event.data)));
    }

    if (event.type !== "action.result") {
      continue;
    }

    const action = event.data as { name?: string; result?: unknown };
    if (action.name === "write_report") {
      writeReports.push(redactJsonValue(action.result, redactor));
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

  return redactJsonValue(reportResult.value, redactor);
}

function defaultMockReport(
  input: EveSessionInput,
  screenshot: SuccessfulMobileDeviceToolResult,
  loggedIn: boolean,
  screenshotStorage: ScreenshotStorage,
): QaReport {
  const checksPerformed = [
    "Loaded PR Context",
    ...(loggedIn ? ["Logged in with a configured Auth Profile"] : []),
    "Inspected mobile screen through the Mobile Device Driver",
    "Captured screenshot evidence through the Mobile Device Driver",
  ];

  return {
    status: "passed",
    summary: `Mocked ${input.platform} QA Run completed for PR #${input.prContext.pullRequestNumber}.`,
    checksPerformed,
    issuesFound: [],
    screenshots: buildScreenshotEvidence(input, screenshot, screenshotStorage),
  };
}

function buildScreenshotEvidence(
  input: EveSessionInput,
  screenshot: SuccessfulMobileDeviceToolResult,
  screenshotStorage: ScreenshotStorage,
): QaReport["screenshots"] {
  const screenshotPath = readScreenshotPath(screenshot, input.outDir, input.platform);
  return [
    {
      path: screenshotPath,
      caption: "QA Agent mobile screenshot evidence",
      storage: buildScreenshotStorageMetadata(screenshotPath, screenshotStorage),
    },
  ];
}

function buildScreenshotStorageMetadata(
  screenshotPath: string,
  screenshotStorage: ScreenshotStorage,
): QaReport["screenshots"][number]["storage"] {
  if (screenshotStorage.provider === "artifact") {
    return {
      provider: "artifact",
      artifactPath: normalizeArtifactPath(screenshotPath),
    };
  }

  return undefined;
}

function normalizeArtifactPath(screenshotPath: string): string {
  return path
    .normalize(screenshotPath)
    .split(path.sep)
    .join("/");
}

function readScreenshotPath(
  screenshot: SuccessfulMobileDeviceToolResult,
  outDir: string,
  platform: TargetPlatform,
): string {
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

function toolFailureEvent(
  name: string,
  result: Exclude<MobileDeviceToolResult, { ok: true }>,
): HandleMessageStreamEvent {
  return eveEvent("turn.failed", {
    message: `${name} was blocked by Action Safety Policy: ${result.reason}`,
  });
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
