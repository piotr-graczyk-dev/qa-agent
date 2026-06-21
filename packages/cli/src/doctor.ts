import { loadQaAgentConfig } from "./config.js";

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

  return {
    ok: true,
    messages: [
      "QA Agent doctor passed.",
      `- Config: ${result.configPath}`,
      `- App adapter: ${result.config.app.adapter}`,
      `- Target platforms: ${result.config.targetPlatforms.join(", ")}`,
      `- Model: ${result.config.model.provider}/${result.config.model.modelId}`,
    ],
  };
}
