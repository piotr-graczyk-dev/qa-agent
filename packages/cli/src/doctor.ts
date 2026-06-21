import { loadQaAgentConfig, type QaAgentConfig } from "./config.js";
import { checkAgentDeviceAvailability } from "./mobile-device-driver.js";
import { readAuthProfileSecretEnvNames } from "./auth-profiles.js";

export type DoctorResult =
  | { ok: true; messages: string[] }
  | { ok: false; messages: string[] };

export async function runDoctor(configPath: string): Promise<DoctorResult> {
  const result = await loadQaAgentConfig(configPath);

  if (!result.ok) {
    return {
      ok: false,
      messages: [
        `QA Agent doctor found ${result.errors.length} configuration issue${result.errors.length === 1 ? "" : "s"}.`,
        ...result.errors.map((error) => `- ${error}`),
      ],
    };
  }

  const environmentIssues = [
    ...validateCredentials(result.config),
    ...validateAgentDevice(),
  ];
  if (environmentIssues.length > 0) {
    return {
      ok: false,
      messages: [
        `QA Agent doctor found ${environmentIssues.length} environment issue${environmentIssues.length === 1 ? "" : "s"}.`,
        ...environmentIssues.map((error) => `- ${error}`),
      ],
    };
  }

  const agentDevice = checkAgentDeviceAvailability();

  return {
    ok: true,
    messages: [
      "QA Agent doctor passed.",
      `- Config: ${result.configPath}`,
      `- App adapter: ${result.config.app.adapter}`,
      `- Target platforms: ${result.config.targetPlatforms.join(", ")}`,
      `- Model: ${result.config.model.provider}/${result.config.model.modelId}`,
      `- Screenshot storage: ${formatScreenshotStorage(result.config.screenshotStorage)}`,
      `- Mobile Device Driver: agent-device ${agentDevice.ok ? agentDevice.version : "unavailable"}`,
      `- Action safety: ${formatActionSafetyPolicy(result.config.actionSafetyPolicy)}`,
    ],
  };
}

function validateCredentials(config: QaAgentConfig): string[] {
  const issues: string[] = [];

  if (config.screenshotStorage.provider === "vercel-blob") {
    const tokenEnv = config.screenshotStorage.tokenEnv;
    if (!process.env[tokenEnv]?.trim()) {
      issues.push(
        `screenshotStorage: Vercel Blob storage requires ${tokenEnv} to be set.`,
      );
    }
  }

  for (const [profileName, profile] of Object.entries(config.authProfiles)) {
    for (const envName of readAuthProfileSecretEnvNames({ [profileName]: profile })) {
      if (!process.env[envName]?.trim()) {
        issues.push(
          `authProfiles.${profileName}: ${profile.type} Auth Profile requires ${envName} to be set.`,
        );
      }
    }
  }

  return issues;
}

function validateAgentDevice(): string[] {
  const agentDevice = checkAgentDeviceAvailability();
  if (agentDevice.ok) {
    return [];
  }

  return [`mobileDeviceDriver: ${agentDevice.message}`];
}

function formatScreenshotStorage(
  storage: QaAgentConfig["screenshotStorage"],
): string {
  if (storage.provider === "artifact") {
    return `artifact (${storage.artifactsDir})`;
  }

  return `vercel-blob (${storage.tokenEnv})`;
}

function formatActionSafetyPolicy(
  policy: QaAgentConfig["actionSafetyPolicy"],
): string {
  if (policy.mode === "safe_only") {
    return "safe_only";
  }

  return `allow_project_actions (${policy.allowedIntents.length} allowed, ${policy.forbiddenIntents.length} forbidden)`;
}
