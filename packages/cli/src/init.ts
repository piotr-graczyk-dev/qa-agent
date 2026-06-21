import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type InitStatus = "created" | "unchanged" | "skipped";

export type InitFileResult = {
  path: string;
  status: InitStatus;
};

export type InitResult = {
  ok: true;
  projectDir: string;
  files: InitFileResult[];
};

type GeneratedFile = {
  relativePath: string;
  contents: string;
  mode?: number;
};

const nonFileCollision = Symbol("nonFileCollision");
type ExistingFile = string | typeof nonFileCollision | undefined;

const GENERATED_FILES: GeneratedFile[] = [
  {
    relativePath: "qa-agent.config.mjs",
    contents: `import { defineQaAgentConfig } from "qa-agent";

export default defineQaAgentConfig({
  targetPlatforms: ["android"],
  model: {
    provider: "TODO_MODEL_PROVIDER",
    modelId: "TODO_MODEL_ID",
    apiKeyEnv: "QA_AGENT_MODEL_API_KEY",
  },
  app: {
    adapter: "expo-eas",
    easProjectId: "TODO_EAS_PROJECT_ID",
    android: {
      applicationId: "TODO_ANDROID_APPLICATION_ID",
    },
  },
  screenshotStorage: {
    provider: "artifact",
    artifactsDir: "qa-agent/screenshots",
  },
  actionSafetyPolicy: {
    mode: "safe_only",
  },
});
`,
  },
  {
    relativePath: ".eas/workflows/qa-agent-android.yml",
    contents: `name: QA Agent Android

on:
  pull_request:
    branches:
      - "*"

jobs:
  qa_agent_android:
    type: build
    params:
      platform: android
      profile: preview
    steps:
      - uses: eas/checkout
      - uses: eas/install_node_modules
      - name: Provision QA Agent tooling
        run: ./scripts/qa-agent/provision-tooling.sh
      - name: Validate QA Agent configuration
        run: npx qa-agent doctor --project .
      - name: Run QA Agent
        run: npx qa-agent run --project . --platform android
`,
  },
  {
    relativePath: "scripts/qa-agent/provision-tooling.sh",
    mode: 0o755,
    contents: `#!/usr/bin/env bash
set -euo pipefail

echo "Provisioning QA Agent tooling for Android."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required before running QA Agent." >&2
  exit 1
fi

echo "TODO: install and verify agent-device for Android before qa-agent run."
echo "TODO: keep model API keys and app credentials in EAS/GitHub secrets, not in this file."
`,
  },
];

export async function runInit(projectDir: string): Promise<InitResult> {
  const resolvedProjectDir = path.resolve(projectDir);
  const files: InitFileResult[] = [];

  for (const generatedFile of GENERATED_FILES) {
    files.push(await writeGeneratedFile(resolvedProjectDir, generatedFile));
  }

  return {
    ok: true,
    projectDir: resolvedProjectDir,
    files,
  };
}

async function writeGeneratedFile(
  projectDir: string,
  generatedFile: GeneratedFile,
): Promise<InitFileResult> {
  const absolutePath = path.join(projectDir, generatedFile.relativePath);

  const existing = await readExistingFile(absolutePath);
  if (existing === generatedFile.contents) {
    return { path: absolutePath, status: "unchanged" };
  }

  if (existing !== undefined) {
    return { path: absolutePath, status: "skipped" };
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, generatedFile.contents, {
    encoding: "utf8",
    mode: generatedFile.mode,
  });

  return { path: absolutePath, status: "created" };
}

async function readExistingFile(filePath: string): Promise<ExistingFile> {
  try {
    const stats = await lstat(filePath);
    if (!stats.isFile()) {
      return nonFileCollision;
    }
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }

    if (isNonFileCollision(error)) {
      return nonFileCollision;
    }

    throw error;
  }

  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }

    if (isNonFileCollision(error)) {
      return nonFileCollision;
    }

    throw error;
  }
}

function isFileNotFound(error: unknown): boolean {
  return getErrorCode(error) === "ENOENT";
}

function isNonFileCollision(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "EISDIR" || code === "ENOTDIR";
}

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    return (error as NodeJS.ErrnoException).code;
  }

  return undefined;
}
