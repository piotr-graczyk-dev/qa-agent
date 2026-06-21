import { defineQaAgentConfig } from "qa-agent";

export default defineQaAgentConfig({
  targetPlatforms: ["android"],
  model: {
    provider: "openai",
    modelId: "gpt-4.1",
    apiKeyEnv: "QA_AGENT_MODEL_API_KEY",
  },
  app: {
    adapter: "expo-eas",
    easProjectId: "00000000-0000-0000-0000-000000000016",
    android: {
      applicationId: "dev.piotrgraczyk.qaagent.example",
    },
  },
  screenshotStorage: {
    provider: "artifact",
    artifactsDir: "qa-agent/screenshots",
  },
  actionSafetyPolicy: {
    mode: "safe_only",
  },
  authProfiles: {
    demo_user: {
      type: "email_password",
      emailEnv: "QA_AGENT_EXAMPLE_EMAIL",
      passwordEnv: "QA_AGENT_EXAMPLE_PASSWORD",
      emailField: 'testID="email-input"',
      passwordField: 'testID="password-input"',
      submitButton: 'testID="login-submit"',
    },
  },
});
