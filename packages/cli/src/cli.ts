#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runDoctor } from "./doctor.js";

type ParsedCli = {
  command?: string;
  projectDir: string;
  configPath?: string;
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

  if (parsed.help || !parsed.command) {
    printHelp(parsed.command === "doctor" ? "doctor" : "root");
    return 0;
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

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printHelp(scope: "root" | "doctor"): void {
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

  console.log(`Usage: qa-agent <command>

Commands:
  doctor   Validate QA Agent Config

Run "qa-agent doctor --help" for command options.`);
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
