import { defineQaAgentConfig } from "../../../dist/index.js";

export default defineQaAgentConfig({
  targetPlatforms: ["android"],
  model: {
    provider: "openai",
    modelId: "gpt-4.1",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  app: {
    adapter: "expo-eas",
    easProjectId: "00000000-0000-0000-0000-000000000000",
    android: {
      applicationId: "com.example.qaagent",
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
