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
  authProfiles: {},
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
      - name: Write GitHub PR Context
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: \${{ github.repository }}
          GITHUB_PULL_REQUEST_NUMBER: \${{ github.event.pull_request.number }}
        run: |
          mkdir -p qa-agent
          gh pr view "$GITHUB_PULL_REQUEST_NUMBER" --repo "$GITHUB_REPOSITORY" --json title,body,labels,baseRefName,headRefName,files --jq '{provider:"github",repository:env.GITHUB_REPOSITORY,pullRequestNumber:(env.GITHUB_PULL_REQUEST_NUMBER|tonumber),title:.title,body:(.body // ""),labels:[.labels[].name],branchRefs:{base:.baseRefName,head:.headRefName},changedFilePaths:[.files[].path]}' > qa-agent/pr-context.json
      - name: Provision QA Agent tooling
        run: ./scripts/qa-agent/provision-tooling.sh
      - name: Validate QA Agent configuration
        run: npx qa-agent doctor --project .
      - name: Install and launch Android QA app
        env:
          QA_AGENT_ANDROID_APK_PATH: TODO_ANDROID_APK_PATH
          QA_AGENT_ANDROID_APPLICATION_ID: TODO_ANDROID_APPLICATION_ID
        run: ./scripts/qa-agent/prepare-android-app.sh
      - name: Run QA Agent
        run: npx qa-agent run --project . --platform android --pr-context qa-agent/pr-context.json --out artifacts/qa-agent/android
      - name: Render GitHub QA Agent comment
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: \${{ github.repository }}
          GITHUB_PULL_REQUEST_NUMBER: \${{ github.event.pull_request.number }}
        run: npx qa-agent render-comment --project . --android-report artifacts/qa-agent/android/qa-report.json --repo "$GITHUB_REPOSITORY" --pr "$GITHUB_PULL_REQUEST_NUMBER"
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

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to provision agent-device." >&2
  exit 1
fi

agent_device_package="\${QA_AGENT_AGENT_DEVICE_PACKAGE:-agent-device@0.17.6}"

if ! command -v agent-device >/dev/null 2>&1; then
  echo "Installing agent-device from npm package: $agent_device_package"
  npm install --global "$agent_device_package"
fi

agent-device --version

echo "QA Agent tooling is provisioned."
echo "Keep model API keys and app credentials in EAS/GitHub secrets, not in this file."
`,
  },
  {
    relativePath: "scripts/qa-agent/prepare-android-app.sh",
    mode: 0o755,
    contents: `#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local env_name="$1"
  local help="$2"

  if [[ -z "\${!env_name:-}" ]]; then
    echo "$env_name is required. $help" >&2
    exit 1
  fi
}

require_env "QA_AGENT_ANDROID_APK_PATH" "Set it to the Android APK produced or downloaded by the EAS workflow."
require_env "QA_AGENT_ANDROID_APPLICATION_ID" "Set it to the Android application id from qa-agent.config.mjs."

if ! command -v agent-device >/dev/null 2>&1; then
  echo "agent-device must be provisioned before preparing the Android QA app." >&2
  exit 1
fi

if [[ ! -f "$QA_AGENT_ANDROID_APK_PATH" ]]; then
  echo "Android APK not found at QA_AGENT_ANDROID_APK_PATH=$QA_AGENT_ANDROID_APK_PATH" >&2
  exit 1
fi

echo "Installing Android QA app from $QA_AGENT_ANDROID_APK_PATH."
agent-device install --platform android --path "$QA_AGENT_ANDROID_APK_PATH" --session qa-agent-android

echo "Launching Android QA app $QA_AGENT_ANDROID_APPLICATION_ID."
agent-device launch --platform android --app-id "$QA_AGENT_ANDROID_APPLICATION_ID" --session qa-agent-android

echo "Android QA app is installed and launched."
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
