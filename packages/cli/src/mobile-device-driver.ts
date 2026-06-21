import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import {
  evaluateActionSafetyPolicy,
  type ActionSafetyPolicy,
} from "./action-safety.js";
import type { TargetPlatform } from "./config.js";

export type AgentDeviceAvailability =
  | { ok: true; version: string }
  | { ok: false; message: string };

export type MobileDeviceCommandResult = {
  command: string;
  stdout: string;
  stderr: string;
};

export type MobileDeviceDriver = {
  inspectUi(input?: { interactiveOnly?: boolean }): Promise<MobileDeviceCommandResult>;
  tap(input: { target: string }): Promise<MobileDeviceCommandResult>;
  enterText(input: { target: string; text: string }): Promise<MobileDeviceCommandResult>;
  goBack(input?: { system?: boolean }): Promise<MobileDeviceCommandResult>;
  openDeepLink(input: { url: string }): Promise<MobileDeviceCommandResult>;
  takeScreenshot(input: { path: string }): Promise<MobileDeviceCommandResult>;
};

export type MobileDeviceToolResult =
  | {
      ok: true;
      action: string;
      intent: string;
      result: MobileDeviceCommandResult;
    }
  | {
      ok: false;
      action: string;
      intent: string;
      blocked: true;
      reason: string;
    };

export type MobileDeviceRuntimeTools = {
  inspectUi(input?: {
    interactiveOnly?: boolean;
    intent?: string;
  }): Promise<MobileDeviceToolResult>;
  tap(input: { target: string; intent?: string }): Promise<MobileDeviceToolResult>;
  enterText(input: {
    target: string;
    text: string;
    intent?: string;
  }): Promise<MobileDeviceToolResult>;
  goBack(input?: {
    system?: boolean;
    intent?: string;
  }): Promise<MobileDeviceToolResult>;
  openDeepLink(input: {
    url: string;
    intent?: string;
  }): Promise<MobileDeviceToolResult>;
  takeScreenshot(input: {
    path: string;
    intent?: string;
  }): Promise<MobileDeviceToolResult>;
};

type AgentDeviceDriverOptions = {
  platform: TargetPlatform;
  sessionName?: string;
  agentDeviceBin?: string;
};

type CommandRunner = (
  file: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

export function checkAgentDeviceAvailability(): AgentDeviceAvailability {
  const result = spawnSync("agent-device", ["--version"], {
    encoding: "utf8",
  });

  if (result.error) {
    return {
      ok: false,
      message: `agent-device is not available: ${result.error.message}`,
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      message: `agent-device --version failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`}`,
    };
  }

  return { ok: true, version: result.stdout.trim() || "unknown" };
}

export function createAgentDeviceDriver(
  options: AgentDeviceDriverOptions,
  runCommand: CommandRunner = runAgentDeviceCommand,
): MobileDeviceDriver {
  const bin = options.agentDeviceBin ?? "agent-device";
  const commonFlags = [
    "--platform",
    options.platform,
    "--session",
    options.sessionName ?? `qa-agent-${options.platform}`,
  ];

  return {
    inspectUi(input = {}) {
      const args = ["snapshot", "--json", ...commonFlags];
      if (input.interactiveOnly) {
        args.splice(1, 0, "-i");
      }

      return runDriverCommand(bin, args, runCommand);
    },
    tap(input) {
      return runDriverCommand(bin, ["press", input.target, ...commonFlags], runCommand);
    },
    enterText(input) {
      return runDriverCommand(
        bin,
        ["fill", input.target, input.text, ...commonFlags],
        runCommand,
      );
    },
    goBack(input = {}) {
      return runDriverCommand(
        bin,
        ["back", input.system ? "--system" : "--in-app", ...commonFlags],
        runCommand,
      );
    },
    openDeepLink(input) {
      return runDriverCommand(bin, ["open", input.url, ...commonFlags], runCommand);
    },
    takeScreenshot(input) {
      return runDriverCommand(
        bin,
        ["screenshot", "--out", input.path, ...commonFlags],
        runCommand,
      );
    },
  };
}

export function createMockMobileDeviceDriver(): MobileDeviceDriver {
  const commandResult = (command: string, stdout: unknown): MobileDeviceCommandResult => ({
    command,
    stdout: JSON.stringify(stdout),
    stderr: "",
  });

  return {
    async inspectUi(input = {}) {
      return commandResult("agent-device snapshot", {
        screenName: "FixtureHome",
        interactiveOnly: input.interactiveOnly ?? false,
        visibleText: ["Welcome", "Start learning", "Profile"],
      });
    },
    async tap(input) {
      return commandResult("agent-device press", { pressed: input.target });
    },
    async enterText(input) {
      return commandResult("agent-device fill", {
        target: input.target,
        textLength: input.text.length,
      });
    },
    async goBack(input = {}) {
      return commandResult("agent-device back", { system: input.system ?? false });
    },
    async openDeepLink(input) {
      return commandResult("agent-device open", { url: input.url });
    },
    async takeScreenshot(input) {
      return commandResult("agent-device screenshot", {
        path: input.path,
        caption: "Mocked fixture home screen",
      });
    },
  };
}

export function createMobileDeviceRuntimeTools(
  driver: MobileDeviceDriver,
  policy: ActionSafetyPolicy,
): MobileDeviceRuntimeTools {
  return {
    inspectUi(input = {}) {
      return runPolicyGuardedTool({
        action: "inspect_ui",
        intent: input.intent ?? "inspect_ui",
        policy,
        execute: () => driver.inspectUi(input),
      });
    },
    tap(input) {
      return runPolicyGuardedTool({
        action: "tap",
        intent: input.intent ?? "navigate",
        policy,
        execute: () => driver.tap(input),
      });
    },
    enterText(input) {
      return runPolicyGuardedTool({
        action: "enter_text",
        intent: input.intent ?? "enter_text",
        policy,
        execute: () => driver.enterText(input),
      });
    },
    goBack(input = {}) {
      return runPolicyGuardedTool({
        action: "go_back",
        intent: input.intent ?? "go_back",
        policy,
        execute: () => driver.goBack(input),
      });
    },
    openDeepLink(input) {
      return runPolicyGuardedTool({
        action: "open_deeplink",
        intent: input.intent ?? "open_deeplink",
        policy,
        execute: () => driver.openDeepLink(input),
      });
    },
    takeScreenshot(input) {
      return runPolicyGuardedTool({
        action: "take_screenshot",
        intent: input.intent ?? "take_screenshot",
        policy,
        execute: () => driver.takeScreenshot(input),
      });
    },
  };
}

export function buildScreenshotPath(outDir: string, platform: TargetPlatform): string {
  return path.join(outDir, `qa-agent-${platform}-screen.png`);
}

async function runPolicyGuardedTool(input: {
  action: string;
  intent: string;
  policy: ActionSafetyPolicy;
  execute: () => Promise<MobileDeviceCommandResult>;
}): Promise<MobileDeviceToolResult> {
  const decision = evaluateActionSafetyPolicy(input.policy, input.intent);
  if (!decision.allowed) {
    return {
      ok: false,
      action: input.action,
      intent: decision.intent,
      blocked: true,
      reason: decision.reason,
    };
  }

  return {
    ok: true,
    action: input.action,
    intent: decision.intent,
    result: await input.execute(),
  };
}

async function runDriverCommand(
  file: string,
  args: string[],
  runCommand: CommandRunner,
): Promise<MobileDeviceCommandResult> {
  const result = await runCommand(file, args);
  return {
    command: [file, ...args.map(shellQuote)].join(" "),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function runAgentDeviceCommand(
  file: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${file} ${args.join(" ")} failed with exit ${code}: ${stderr.trim() || stdout.trim()}`,
        ),
      );
    });
  });
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}
