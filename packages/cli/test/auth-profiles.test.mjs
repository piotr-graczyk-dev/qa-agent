import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAuthRuntimeTools,
  createMockMobileDeviceDriver,
  redactJsonValue,
  createSecretRedactor,
  authProfilesSchema,
} from "../dist/index.js";

function authProfiles() {
  return {
    qa_user: {
      type: "email_password",
      emailEnv: "QA_AGENT_LOGIN_EMAIL",
      passwordEnv: "QA_AGENT_LOGIN_PASSWORD",
      emailField: 'id="email"',
      passwordField: 'id="password"',
      submitButton: 'id="submit"',
    },
  };
}

describe("Auth Profiles", () => {
  it("supports all v1 Login Types in QA Agent Config", () => {
    const result = authProfilesSchema.parse({
      password_user: {
        type: "email_password",
        emailEnv: "QA_AGENT_LOGIN_EMAIL",
        passwordEnv: "QA_AGENT_LOGIN_PASSWORD",
        emailField: 'id="email"',
        passwordField: 'id="password"',
      },
      magic_user: {
        type: "magic_link_deeplink",
        deeplinkUrlEnv: "QA_AGENT_MAGIC_LINK",
      },
      otp_user: {
        type: "otp_command",
        commandEnv: "QA_AGENT_OTP_COMMAND",
        otpField: 'id="otp"',
      },
    });

    assert.equal(result.password_user.type, "email_password");
    assert.equal(result.magic_user.type, "magic_link_deeplink");
    assert.equal(result.otp_user.type, "otp_command");
  });

  it("logs in with a profile name while resolving email/password from environment variables", async () => {
    const tools = createAuthRuntimeTools({
      profiles: authProfiles(),
      driver: createMockMobileDeviceDriver(),
      policy: { mode: "safe_only" },
      env: {
        QA_AGENT_LOGIN_EMAIL: "qa@example.com",
        QA_AGENT_LOGIN_PASSWORD: "super-secret-password",
      },
    });

    const result = await tools.loginWithProfile({ profileName: "qa_user" });
    const serialized = JSON.stringify(result);

    assert.equal(result.ok, true);
    assert.equal(result.loginType, "email_password");
    assert.match(result.message, /qa_user/);
    assert.doesNotMatch(serialized, /qa@example\.com/);
    assert.doesNotMatch(serialized, /super-secret-password/);
  });

  it("blocks clearly when a configured secret environment variable is missing", async () => {
    const tools = createAuthRuntimeTools({
      profiles: authProfiles(),
      driver: createMockMobileDeviceDriver(),
      policy: { mode: "safe_only" },
      env: {
        QA_AGENT_LOGIN_EMAIL: "qa@example.com",
        QA_AGENT_LOGIN_PASSWORD: "",
      },
    });

    const result = await tools.loginWithProfile({ profileName: "qa_user" });

    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.match(result.reason, /QA_AGENT_LOGIN_PASSWORD/);
    assert.doesNotMatch(JSON.stringify(result), /qa@example\.com/);
  });

  it("blocks clearly when no Auth Profile is configured for the requested name", async () => {
    const tools = createAuthRuntimeTools({
      profiles: {},
      driver: createMockMobileDeviceDriver(),
      policy: { mode: "safe_only" },
      env: {},
    });

    const result = await tools.loginWithProfile({ profileName: "qa_user" });

    assert.equal(result.ok, false);
    assert.match(result.reason, /No Auth Profiles are configured/);
    assert.match(result.diagnostics.join("\n"), /Configure authProfiles/);
  });

  it("turns OTP command failures into blocked tool results", async () => {
    const tools = createAuthRuntimeTools({
      profiles: {
        otp_user: {
          type: "otp_command",
          commandEnv: "QA_AGENT_OTP_COMMAND",
          otpField: 'id="otp"',
        },
      },
      driver: createMockMobileDeviceDriver(),
      policy: { mode: "safe_only" },
      env: {
        QA_AGENT_OTP_COMMAND: "print-otp",
      },
      async runOtpCommand() {
        throw new Error("command timed out after 30000ms");
      },
    });

    const result = await tools.loginWithProfile({ profileName: "otp_user" });

    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.match(result.reason, /OTP command failed/);
    assert.match(result.diagnostics.join("\n"), /QA_AGENT_OTP_COMMAND/);
    assert.match(result.diagnostics.join("\n"), /timed out/);
    assert.doesNotMatch(JSON.stringify(result), /print-otp/);
  });

  it("redacts known credential values and token-shaped strings recursively", () => {
    const redactor = createSecretRedactor(["super-secret-password"]);
    const result = redactJsonValue(
      {
        summary: "password=super-secret-password",
        diagnostics: ["Bearer ghp_1234567890abcdefghijklmnop"],
      },
      redactor,
    );

    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /super-secret-password/);
    assert.doesNotMatch(serialized, /ghp_1234567890abcdefghijklmnop/);
    assert.match(serialized, /\[REDACTED\]/);
  });
});
