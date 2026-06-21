#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import { runQaAgent } from "./run.js";

type ParsedCli = {
  command?: string;
  projectDir: string;
  configPath?: string;
  mockReportPath?: string;
  outDir?: string;
  platform?: "android" | "ios";
  prContextPath?: string;
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

  if (parsed.command === "run") {
    const configPath = resolveConfigPath(parsed);
    if (!existsSync(configPath)) {
      console.error(`QA Agent Config not found: ${configPath}`);
      return 1;
    }

    if (!parsed.prContextPath) {
      console.error("qa-agent run requires --pr-context <path>");
      return 1;
    }

    const result = await runQaAgent({
      configPath,
      mockReportPath: parsed.mockReportPath
        ? resolveProjectPath(parsed.projectDir, parsed.mockReportPath)
        : undefined,
      outDir: resolveProjectPath(
        parsed.projectDir,
        parsed.outDir ?? "artifacts/qa-agent",
      ),
      platform: parsed.platform ?? "android",
      prContextPath: resolveProjectPath(parsed.projectDir, parsed.prContextPath),
    });
    const output = result.ok ? console.log : console.error;
    for (const message of result.messages) {
      output(message);
    }

    return result.ok ? 0 : 1;
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

function printHelp(scope: "root" | "init" | "doctor" | "run"): void {
  if (scope === "init") {
    console.log(`Usage: qa-agent init [--project <dir>]

Scaffold Android-first Expo/EAS QA Agent setup files.

Options:
  --project <dir>   Project directory where setup files are written
  -h, --help        Show this help message

The initializer writes QA Agent config, EAS workflow, and support scripts only.`);
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

Run a QA Agent session against PR Context and a mocked Mobile Device Driver.

Options:
  --project <dir>      Project directory containing QA Agent config and artifacts
  --config <path>      Config path, relative to --project unless absolute
  --pr-context <path>  PR Context JSON path, relative to --project unless absolute
  --platform <target>  Target platform, android by default
  --out <dir>          Artifact directory, defaults to artifacts/qa-agent
  --mock-report <path> Fixture-only write_report payload path
  -h, --help           Show this help message

The command writes exactly one validated QA Report artifact named qa-report.json.`);
    return;
  }

  console.log(`Usage: qa-agent <command>

Commands:
  init     Scaffold Android-first Expo/EAS QA Agent files
  doctor   Validate QA Agent Config
  run      Run a mocked QA Run through the Eve session contract

Run "qa-agent init --help" for command options.
Run "qa-agent doctor --help" for command options.
Run "qa-agent run --help" for command options.`);
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
