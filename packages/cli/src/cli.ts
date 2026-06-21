#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createGitHubCommentClient,
  loadPlatformReport,
  renderQaReportComment,
  upsertQaReportComment,
} from "./comment.js";
import { runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import {
  MOCKABLE_RUNTIME_ACTION_NAMES,
  runQaAgent,
  type MockableRuntimeActionName,
} from "./run.js";

type ParsedCli = {
  command?: string;
  projectDir: string;
  configPath?: string;
  mockReportPath?: string;
  mockDeviceDriver: boolean;
  mockRequestedAction?: MockableRuntimeActionName;
  outDir?: string;
  platform?: "android" | "ios";
  prContextPath?: string;
  androidReportPath?: string;
  iosReportPath?: string;
  repository?: string;
  pullRequestNumber?: number;
  githubToken?: string;
  error?: string;
  help: boolean;
};

const DEFAULT_CONFIG_FILES = [
  "qa-agent.config.mjs",
  "qa-agent.config.js",
  "qa-agent.config.ts",
  "qa-agent.config.mts",
] as const;

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.error) {
    console.error(parsed.error);
    return 1;
  }

  if (parsed.help || !parsed.command) {
    printHelp(
      parsed.command === "doctor"
        ? "doctor"
        : parsed.command === "init"
          ? "init"
          : parsed.command === "run"
            ? "run"
            : parsed.command === "run-local"
              ? "run-local"
              : parsed.command === "render-comment"
                ? "render-comment"
                : "root",
    );
    return 0;
  }

  if (parsed.command === "init") {
    const result = await runInit(parsed.projectDir);
    console.log(`QA Agent init completed: ${result.projectDir}`);
    for (const file of result.files) {
      console.log(`- ${file.status}: ${file.path}`);
    }

    return 0;
  }

  if (parsed.command === "run" || parsed.command === "run-local") {
    const configPath = resolveConfigPath(parsed);
    if (!existsSync(configPath)) {
      console.error(`QA Agent Config not found: ${configPath}`);
      return 1;
    }

    if (!parsed.prContextPath) {
      console.error(`qa-agent ${parsed.command} requires --pr-context <path>`);
      return 1;
    }

    const result = await runQaAgent({
      configPath,
      mode: parsed.command === "run-local" ? "local" : "ci",
      mockRequestedAction: parsed.mockRequestedAction,
      mockReportPath: parsed.mockReportPath
        ? resolveProjectPath(parsed.projectDir, parsed.mockReportPath)
        : undefined,
      outDir: resolveProjectPath(
        parsed.projectDir,
        parsed.outDir ?? "artifacts/qa-agent",
      ),
      platform: parsed.platform ?? "android",
      prContextPath: resolveProjectPath(parsed.projectDir, parsed.prContextPath),
      mockDeviceDriver: parsed.mockDeviceDriver,
    });
    const output = result.ok ? console.log : console.error;
    for (const message of result.messages) {
      output(message);
    }

    return result.ok ? 0 : 1;
  }

  if (parsed.command === "render-comment") {
    return await runRenderCommentCommand(parsed);
  }

  if (parsed.command !== "doctor") {
    console.error(`Unknown command: ${parsed.command}`);
    printHelp("root");
    return 1;
  }

  const configPath = resolveConfigPath(parsed);
  if (!existsSync(configPath)) {
    console.error(`QA Agent Config not found: ${configPath}`);
    return 1;
  }

  const result = await runDoctor(configPath);
  const output = result.ok ? console.log : console.error;
  for (const message of result.messages) {
    output(message);
  }

  return result.ok ? 0 : 1;
}

function parseArgs(argv: string[]): ParsedCli {
  const parsed: ParsedCli = {
    command: argv[0],
    projectDir: process.cwd(),
    mockDeviceDriver: false,
    help: false,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (arg === "--project") {
      parsed.projectDir = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--config") {
      parsed.configPath = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--mock-report") {
      parsed.mockReportPath = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--mock-device-driver") {
      parsed.mockDeviceDriver = true;
      continue;
    }

    if (arg === "--mock-requested-action") {
      const action = requireValue(argv, index, arg);
      if (isMockableRuntimeActionName(action)) {
        parsed.mockRequestedAction = action;
      } else {
        parsed.error = `${arg} must be one of: ${MOCKABLE_RUNTIME_ACTION_NAMES.join(", ")}`;
      }
      index += 1;
      continue;
    }

    if (arg === "--out") {
      parsed.outDir = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--platform") {
      const platform = requireValue(argv, index, arg);
      if (platform === "android" || platform === "ios") {
        parsed.platform = platform;
      } else {
        parsed.error = `--platform must be "android" or "ios", received "${platform}"`;
      }
      index += 1;
      continue;
    }

    if (arg === "--pr-context") {
      parsed.prContextPath = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--android-report") {
      parsed.androidReportPath = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--ios-report") {
      parsed.iosReportPath = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--repo") {
      parsed.repository = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--pr") {
      parsed.pullRequestNumber = parsePositiveInteger(
        requireValue(argv, index, arg),
        arg,
      );
      index += 1;
      continue;
    }

    if (arg === "--github-token") {
      parsed.githubToken = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (!parsed.command) {
      parsed.command = arg;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (parsed.command === "--help" || parsed.command === "-h") {
    parsed.command = undefined;
    parsed.help = true;
  }

  return parsed;
}

async function runRenderCommentCommand(parsed: ParsedCli): Promise<number> {
  if (!parsed.androidReportPath) {
    console.error("render-comment requires --android-report <path>.");
    return 1;
  }

  const projectDir = path.resolve(parsed.projectDir);
  const reports = [
    await loadPlatformReport({
      platform: "android",
      path: resolveProjectPath(projectDir, parsed.androidReportPath),
    }),
  ];

  if (parsed.iosReportPath) {
    reports.push(
      await loadPlatformReport({
        platform: "ios",
        path: resolveProjectPath(projectDir, parsed.iosReportPath),
      }),
    );
  }

  const body = renderQaReportComment(reports);
  const hasGitHubTarget = parsed.repository || parsed.pullRequestNumber;
  if (!hasGitHubTarget) {
    console.log(body);
    return 0;
  }

  if (!parsed.repository || !parsed.pullRequestNumber) {
    console.error("render-comment upsert requires both --repo and --pr.");
    return 1;
  }

  const githubToken = parsed.githubToken ?? process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.error(
      "render-comment upsert requires --github-token or GITHUB_TOKEN.",
    );
    return 1;
  }

  const client = createGitHubCommentClient({
    repository: parsed.repository,
    pullRequestNumber: parsed.pullRequestNumber,
    token: githubToken,
  });
  const result = await upsertQaReportComment(client, body);
  console.log(`QA Agent comment ${result.action}: ${result.comment.id}`);
  return 0;
}

function resolveConfigPath(parsed: ParsedCli): string {
  const projectDir = path.resolve(parsed.projectDir);
  if (parsed.configPath) {
    return path.isAbsolute(parsed.configPath)
      ? parsed.configPath
      : path.join(projectDir, parsed.configPath);
  }

  for (const filename of DEFAULT_CONFIG_FILES) {
    const candidate = path.join(projectDir, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(projectDir, DEFAULT_CONFIG_FILES[0]);
}

function resolveProjectPath(projectDir: string, filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(path.resolve(projectDir), filePath);
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== value) {
    throw new Error(`${flag} requires a positive integer`);
  }
  return parsed;
}

function isMockableRuntimeActionName(
  value: string,
): value is MockableRuntimeActionName {
  return MOCKABLE_RUNTIME_ACTION_NAMES.includes(
    value as MockableRuntimeActionName,
  );
}

function printHelp(
  scope: "root" | "init" | "doctor" | "run" | "run-local" | "render-comment",
): void {
  if (scope === "init") {
    console.log(`Usage: qa-agent init [--project <dir>]

Scaffold Android-first Expo/EAS QA Agent setup files.

Options:
  --project <dir>   Project directory where setup files are written
  -h, --help        Show this help message

The initializer writes QA Agent config, EAS workflow, and support scripts only.`);
    return;
  }

  if (scope === "render-comment") {
    console.log(`Usage: qa-agent render-comment --android-report <path> [--ios-report <path>] [--repo <owner/name> --pr <number> --github-token <token>]

Render a QA Report pull request comment from report fixture JSON files.

Options:
  --project <dir>           Project directory used to resolve relative report paths
  --android-report <path>   Android QA Report JSON file
  --ios-report <path>       Optional iOS QA Report JSON file
  --repo <owner/name>       GitHub repository for marker-based comment upsert
  --pr <number>             GitHub pull request number for comment upsert
  --github-token <token>    GitHub token used for comment upsert; defaults to GITHUB_TOKEN
  -h, --help                Show this help message

Without GitHub options, the command prints the rendered Markdown comment to stdout.`);
    return;
  }

  if (scope === "doctor") {
    console.log(`Usage: qa-agent doctor [--project <dir>] [--config <path>]

Validate a QA Agent Config for an Expo/EAS mobile QA project.

Options:
  --project <dir>   Project directory containing qa-agent.config.mjs, .js, .ts, or .mts
  --config <path>   Config path, relative to --project unless absolute
  -h, --help        Show this help message

Default discovery prefers runnable JavaScript config files before TypeScript.
TypeScript config files require a Node loader that can import TypeScript.`);
    return;
  }

  if (scope === "run") {
    console.log(`Usage: qa-agent run [--project <dir>] [--config <path>] --pr-context <path> [--platform <android|ios>] [--out <dir>]

Run a QA Agent session against PR Context and the Mobile Device Driver.

Options:
  --project <dir>      Project directory containing QA Agent config and artifacts
  --config <path>      Config path, relative to --project unless absolute
  --pr-context <path>  PR Context JSON path, relative to --project unless absolute
  --platform <target>  Target platform, android by default
  --out <dir>          Artifact directory, defaults to artifacts/qa-agent
  --mock-report <path> Fixture-only write_report payload path
  --mock-device-driver Use the fixture Mobile Device Driver for contract tests
  --mock-requested-action <name>
                       Fixture-only action request for contract tests
  -h, --help           Show this help message

The command writes exactly one validated QA Report artifact named qa-report.json.`);
    return;
  }

  if (scope === "run-local") {
    console.log(`Usage: qa-agent run-local [--project <dir>] [--config <path>] --pr-context <path> [--platform <android|ios>] [--out <dir>]

Run a local debug QA Agent session against PR Context and an already running app/device.

Options:
  --project <dir>      Project directory containing QA Agent config and artifacts
  --config <path>      Config path, relative to --project unless absolute
  --pr-context <path>  PR Context JSON path, relative to --project unless absolute
  --platform <target>  Target platform, android by default
  --out <dir>          Artifact directory, defaults to artifacts/qa-agent
  --mock-report <path> Fixture-only write_report payload path
  --mock-device-driver Use the fixture Mobile Device Driver for contract tests
  --mock-requested-action <name>
                       Fixture-only action request for contract tests
  -h, --help           Show this help message

Local debug mode assumes the app and device are already running. It does not build, install, provision, or launch them. The command writes exactly one validated QA Report artifact named qa-report.json.`);
    return;
  }

  console.log(`Usage: qa-agent <command>

Commands:
  init            Scaffold Android-first Expo/EAS QA Agent files
  doctor          Validate QA Agent Config
  run             Run a QA Run through the Eve session contract
  run-local       Run a local debug QA Run against an already running app/device
  render-comment  Render or upsert the single QA Agent PR comment

Run "qa-agent init --help" for command options.
Run "qa-agent doctor --help" for command options.
Run "qa-agent run --help" for command options.
Run "qa-agent run-local --help" for command options.
Run "qa-agent render-comment --help" for command options.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
