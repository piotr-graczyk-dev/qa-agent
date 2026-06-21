import { spawn } from "node:child_process";
import { z } from "zod";
import {
  evaluateActionSafetyPolicy,
  type ActionSafetyPolicy,
} from "./action-safety.js";
import type { MobileDeviceDriver } from "./mobile-device-driver.js";
import {
  createSecretRedactor,
  redactJsonValue,
  type SecretRedactor,
} from "./redaction.js";

export const loginTypeSchema = z.enum([
  "email_password",
  "magic_link_deeplink",
  "otp_command",
]);

const authProfileNameSchema = z
  .string()
  .trim()
  .min(1, "auth profile name is required");

const selectorSchema = z.string().trim().min(1);
const envNameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "must be an environment variable name");

export const authProfileSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("email_password"),
      emailEnv: envNameSchema,
      passwordEnv: envNameSchema,
      emailField: selectorSchema,
      passwordField: selectorSchema,
      submitButton: selectorSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("magic_link_deeplink"),
      deeplinkUrlEnv: envNameSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("otp_command"),
      commandEnv: envNameSchema,
      otpField: selectorSchema,
      submitButton: selectorSchema.optional(),
    })
    .strict(),
]);

export const authProfilesSchema = z
  .record(authProfileNameSchema, authProfileSchema)
  .default({});

export type LoginType = z.infer<typeof loginTypeSchema>;
export type AuthProfile = z.infer<typeof authProfileSchema>;
export type AuthProfiles = z.infer<typeof authProfilesSchema>;

export type LoginWithProfileResult =
  | {
      ok: true;
      action: "login_with_profile";
      intent: "login";
      profileName: string;
      loginType: LoginType;
      message: string;
      steps: string[];
    }
  | {
      ok: false;
      action: "login_with_profile";
      intent: "login";
      blocked: true;
      profileName: string;
      reason: string;
      diagnostics: string[];
    };

export type AuthRuntimeTools = {
  loginWithProfile(input: { profileName: string }): Promise<LoginWithProfileResult>;
};

type AuthRuntimeToolOptions = {
  profiles: AuthProfiles;
  driver: MobileDeviceDriver;
  policy: ActionSafetyPolicy;
  env?: NodeJS.ProcessEnv;
  runOtpCommand?: (command: string) => Promise<string>;
};

export function createAuthRuntimeTools(
  options: AuthRuntimeToolOptions,
): AuthRuntimeTools {
  const env = options.env ?? process.env;
  const redactor = createSecretRedactor(readConfiguredSecretValues(options.profiles, env));

  return {
    async loginWithProfile(input) {
      const profileName = input.profileName.trim();
      const policyDecision = evaluateActionSafetyPolicy(options.policy, "login");
      if (!policyDecision.allowed) {
        return blocked(profileName, policyDecision.reason, [policyDecision.reason]);
      }

      const profile = options.profiles[profileName];
      if (!profile) {
        const configuredProfiles = Object.keys(options.profiles);
        const reason =
          configuredProfiles.length === 0
            ? "No Auth Profiles are configured."
            : `Auth Profile "${profileName}" is not configured.`;
        return blocked(profileName, reason, [
          configuredProfiles.length === 0
            ? "Configure authProfiles with at least one named Auth Profile before requesting login."
            : `Configured Auth Profiles: ${configuredProfiles.join(", ")}.`,
        ]);
      }

      if (profile.type === "email_password") {
        return redactLoginResult(
          await loginWithEmailPassword({
            profileName,
            profile,
            driver: options.driver,
            env,
          }),
          redactor,
        );
      }

      if (profile.type === "magic_link_deeplink") {
        return redactLoginResult(
          await loginWithMagicLinkDeepLink({
            profileName,
            profile,
            driver: options.driver,
            env,
          }),
          redactor,
        );
      }

      return redactLoginResult(
        await loginWithOtpCommand({
          profileName,
          profile,
          driver: options.driver,
          env,
          runOtpCommand: options.runOtpCommand ?? runShellCommand,
        }),
        redactor,
      );
    },
  };
}

export function readAuthProfileSecretEnvNames(profiles: AuthProfiles): string[] {
  return Object.values(profiles).flatMap((profile) => {
    if (profile.type === "email_password") {
      return [profile.emailEnv, profile.passwordEnv];
    }

    if (profile.type === "magic_link_deeplink") {
      return [profile.deeplinkUrlEnv];
    }

    return [profile.commandEnv];
  });
}

export function createAuthProfileRedactor(
  profiles: AuthProfiles,
  env: NodeJS.ProcessEnv = process.env,
): SecretRedactor {
  return createSecretRedactor(readConfiguredSecretValues(profiles, env));
}

async function loginWithEmailPassword(input: {
  profileName: string;
  profile: Extract<AuthProfile, { type: "email_password" }>;
  driver: MobileDeviceDriver;
  env: NodeJS.ProcessEnv;
}): Promise<LoginWithProfileResult> {
  const email = readRequiredSecret(input.env, input.profile.emailEnv, input.profileName);
  const password = readRequiredSecret(
    input.env,
    input.profile.passwordEnv,
    input.profileName,
  );

  if (!email.ok) {
    return email.result;
  }

  if (!password.ok) {
    return password.result;
  }

  await input.driver.enterText({
    target: input.profile.emailField,
    text: email.value,
  });
  await input.driver.enterText({
    target: input.profile.passwordField,
    text: password.value,
  });
  if (input.profile.submitButton) {
    await input.driver.tap({ target: input.profile.submitButton });
  }

  return loggedIn(input.profileName, input.profile.type, [
    "Entered email from configured environment variable.",
    "Entered password from configured environment variable.",
    input.profile.submitButton ? "Submitted login form." : "Submitted login form was not configured.",
  ]);
}

async function loginWithMagicLinkDeepLink(input: {
  profileName: string;
  profile: Extract<AuthProfile, { type: "magic_link_deeplink" }>;
  driver: MobileDeviceDriver;
  env: NodeJS.ProcessEnv;
}): Promise<LoginWithProfileResult> {
  const deeplink = readRequiredSecret(
    input.env,
    input.profile.deeplinkUrlEnv,
    input.profileName,
  );
  if (!deeplink.ok) {
    return deeplink.result;
  }

  await input.driver.openDeepLink({ url: deeplink.value });
  return loggedIn(input.profileName, input.profile.type, [
    "Opened magic-link deeplink from configured environment variable.",
  ]);
}

async function loginWithOtpCommand(input: {
  profileName: string;
  profile: Extract<AuthProfile, { type: "otp_command" }>;
  driver: MobileDeviceDriver;
  env: NodeJS.ProcessEnv;
  runOtpCommand: (command: string) => Promise<string>;
}): Promise<LoginWithProfileResult> {
  const command = readRequiredSecret(
    input.env,
    input.profile.commandEnv,
    input.profileName,
  );
  if (!command.ok) {
    return command.result;
  }

  const otp = (await input.runOtpCommand(command.value)).trim();
  if (!otp) {
    return blocked(input.profileName, "OTP command produced no code.", [
      `Auth Profile "${input.profileName}" could not read an OTP code from ${input.profile.commandEnv}.`,
    ]);
  }

  await input.driver.enterText({ target: input.profile.otpField, text: otp });
  if (input.profile.submitButton) {
    await input.driver.tap({ target: input.profile.submitButton });
  }

  return loggedIn(input.profileName, input.profile.type, [
    "Read OTP through configured command environment variable.",
    "Entered OTP into configured field.",
    input.profile.submitButton ? "Submitted OTP form." : "Submitted OTP form was not configured.",
  ]);
}

function loggedIn(
  profileName: string,
  loginType: LoginType,
  steps: string[],
): LoginWithProfileResult {
  return {
    ok: true,
    action: "login_with_profile",
    intent: "login",
    profileName,
    loginType,
    message: `Login completed with Auth Profile "${profileName}".`,
    steps,
  };
}

function readRequiredSecret(
  env: NodeJS.ProcessEnv,
  envName: string,
  profileName: string,
):
  | { ok: true; value: string }
  | { ok: false; result: LoginWithProfileResult } {
  const value = env[envName]?.trim();
  if (value) {
    return { ok: true, value };
  }

  const reason = `Auth Profile "${profileName}" requires ${envName} to be set.`;
  return {
    ok: false,
    result: blocked(profileName, reason, [reason]),
  };
}

function blocked(
  profileName: string,
  reason: string,
  diagnostics: string[],
): LoginWithProfileResult {
  return {
    ok: false,
    action: "login_with_profile",
    intent: "login",
    blocked: true,
    profileName,
    reason,
    diagnostics,
  };
}

function readConfiguredSecretValues(
  profiles: AuthProfiles,
  env: NodeJS.ProcessEnv,
): string[] {
  return readAuthProfileSecretEnvNames(profiles)
    .map((envName) => env[envName])
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

function redactLoginResult(
  result: LoginWithProfileResult,
  redactor: SecretRedactor,
): LoginWithProfileResult {
  return redactJsonValue(result, redactor);
}

function runShellCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`OTP command failed with exit ${code}: ${stderr.trim()}`));
    });
  });
}
