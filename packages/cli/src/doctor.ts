import { loadQaAgentConfig, type QaAgentConfig } from "./config.js";

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

  const credentialIssues = validateCredentials(result.config);
  if (credentialIssues.length > 0) {
    return {
      ok: false,
      messages: [
        `QA Agent doctor found ${credentialIssues.length} environment issue${credentialIssues.length === 1 ? "" : "s"}.`,
        ...credentialIssues.map((error) => `- ${error}`),
      ],
    };
  }

  return {
    ok: true,
    messages: [
      "QA Agent doctor passed.",
      `- Config: ${result.configPath}`,
      `- App adapter: ${result.config.app.adapter}`,
      `- Target platforms: ${result.config.targetPlatforms.join(", ")}`,
      `- Model: ${result.config.model.provider}/${result.config.model.modelId}`,
      `- Screenshot storage: ${formatScreenshotStorage(result.config.screenshotStorage)}`,
    ],
  };
}

function validateCredentials(config: QaAgentConfig): string[] {
  if (config.screenshotStorage.provider !== "vercel-blob") {
    return [];
  }

  const tokenEnv = config.screenshotStorage.tokenEnv;
  if (process.env[tokenEnv]?.trim()) {
    return [];
  }

  return [
    `screenshotStorage: Vercel Blob storage requires ${tokenEnv} to be set.`,
  ];
}

function formatScreenshotStorage(
  storage: QaAgentConfig["screenshotStorage"],
): string {
  if (storage.provider === "artifact") {
    return `artifact (${storage.artifactsDir})`;
  }

  return `vercel-blob (${storage.tokenEnv})`;
}
