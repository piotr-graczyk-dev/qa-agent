import { pathToFileURL } from "node:url";
import { z } from "zod";

export const targetPlatformSchema = z.enum(["android", "ios"]);

export const qaAgentConfigSchema = z
  .object({
    targetPlatforms: z
      .array(targetPlatformSchema)
      .min(1, "targetPlatforms must include at least one platform"),
    model: z.object({
      provider: z.string().trim().min(1, "model.provider is required"),
      modelId: z.string().trim().min(1, "model.modelId is required"),
      apiKeyEnv: z.string().trim().min(1, "model.apiKeyEnv is required"),
    }),
    app: z.object({
      adapter: z.literal("expo-eas"),
      easProjectId: z.string().trim().min(1, "app.easProjectId is required"),
      android: z
        .object({
          applicationId: z
            .string()
            .trim()
            .min(1, "app.android.applicationId is required"),
        })
        .optional(),
      ios: z
        .object({
          bundleIdentifier: z
            .string()
            .trim()
            .min(1, "app.ios.bundleIdentifier is required"),
        })
        .optional(),
    }),
  })
  .superRefine((config, ctx) => {
    if (config.targetPlatforms.includes("android") && !config.app.android) {
      ctx.addIssue({
        code: "custom",
        message:
          "app.android.applicationId is required when targetPlatforms includes android",
        path: ["app", "android"],
      });
    }

    if (config.targetPlatforms.includes("ios") && !config.app.ios) {
      ctx.addIssue({
        code: "custom",
        message:
          "app.ios.bundleIdentifier is required when targetPlatforms includes ios",
        path: ["app", "ios"],
      });
    }
  });

export type TargetPlatform = z.infer<typeof targetPlatformSchema>;
export type QaAgentConfig = z.infer<typeof qaAgentConfigSchema>;
export type QaAgentConfigInput = z.input<typeof qaAgentConfigSchema>;

export function defineQaAgentConfig(
  config: QaAgentConfigInput,
): QaAgentConfigInput {
  return config;
}

export type LoadQaAgentConfigResult =
  | { ok: true; config: QaAgentConfig; configPath: string }
  | { ok: false; configPath: string; errors: string[] };

export async function loadQaAgentConfig(
  configPath: string,
): Promise<LoadQaAgentConfigResult> {
  let loadedConfig: unknown;

  try {
    const module = (await import(
      pathToFileURL(configPath).href
    )) as Record<string, unknown>;
    loadedConfig = module.default ?? module.config;
  } catch (error) {
    return {
      ok: false,
      configPath,
      errors: [
        `Failed to load QA Agent Config: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  const result = qaAgentConfigSchema.safeParse(loadedConfig);
  if (!result.success) {
    return {
      ok: false,
      configPath,
      errors: result.error.issues.map(formatConfigIssue),
    };
  }

  return { ok: true, config: result.data, configPath };
}

function formatConfigIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "config";

  if (path === "model" && issue.message.includes("expected object")) {
    return "model: model configuration is required";
  }

  if (path === "app" && issue.message.includes("expected object")) {
    return "app: app configuration is required";
  }

  return `${path}: ${issue.message}`;
}
