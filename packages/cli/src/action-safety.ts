import { z } from "zod";

export const safeMobileActionIntents = [
  "inspect_ui",
  "navigate",
  "enter_text",
  "go_back",
  "open_deeplink",
  "take_screenshot",
  "login",
] as const;

export const forbiddenMobileActionIntents = [
  "delete_account",
  "delete_data",
  "purchase",
  "payment",
  "send_message",
  "post_content",
  "submit_order",
  "external_share",
  "modify_billing",
  "production_write",
] as const;

export const actionSafetyPolicySchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("safe_only") }).strict(),
    z
      .object({
        mode: z.literal("allow_project_actions"),
        allowedIntents: z
          .array(z.string().trim().min(1, "allowedIntents cannot include empty intents"))
          .default([]),
        forbiddenIntents: z
          .array(z.string().trim().min(1, "forbiddenIntents cannot include empty intents"))
          .default([]),
      })
      .strict(),
  ])
  .default({ mode: "safe_only" });

export type SafeMobileActionIntent = (typeof safeMobileActionIntents)[number];
export type ForbiddenMobileActionIntent =
  (typeof forbiddenMobileActionIntents)[number];
export type ActionSafetyPolicy = z.infer<typeof actionSafetyPolicySchema>;
export type ActionSafetyDecision =
  | { allowed: true; intent: string; reason: string }
  | { allowed: false; intent: string; reason: string };

const safeIntentSet = new Set<string>(safeMobileActionIntents);
const forbiddenIntentSet = new Set<string>(forbiddenMobileActionIntents);

export function evaluateActionSafetyPolicy(
  policy: ActionSafetyPolicy,
  intent: string,
): ActionSafetyDecision {
  const normalizedIntent = intent.trim();
  if (!normalizedIntent) {
    return {
      allowed: false,
      intent,
      reason: "Action intent is required before interacting with the mobile app.",
    };
  }

  if (forbiddenIntentSet.has(normalizedIntent)) {
    return {
      allowed: false,
      intent: normalizedIntent,
      reason: `Action intent "${normalizedIntent}" is always forbidden.`,
    };
  }

  if (safeIntentSet.has(normalizedIntent)) {
    return {
      allowed: true,
      intent: normalizedIntent,
      reason: `Action intent "${normalizedIntent}" is safe for QA exploration.`,
    };
  }

  if (policy.mode === "safe_only") {
    return {
      allowed: false,
      intent: normalizedIntent,
      reason: `Action intent "${normalizedIntent}" is not allowed by safe_only policy.`,
    };
  }

  if (policy.forbiddenIntents.includes(normalizedIntent)) {
    return {
      allowed: false,
      intent: normalizedIntent,
      reason: `Action intent "${normalizedIntent}" is forbidden by project policy.`,
    };
  }

  if (policy.allowedIntents.includes(normalizedIntent)) {
    return {
      allowed: true,
      intent: normalizedIntent,
      reason: `Action intent "${normalizedIntent}" is explicitly allowed by project policy.`,
    };
  }

  return {
    allowed: false,
    intent: normalizedIntent,
    reason: `Action intent "${normalizedIntent}" is not explicitly allowed by project policy.`,
  };
}
