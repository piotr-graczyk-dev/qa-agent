import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMockMobileDeviceDriver,
  createMobileDeviceRuntimeTools,
  evaluateActionSafetyPolicy,
} from "../dist/index.js";

describe("Action Safety Policy", () => {
  it("allows safe UI inspection and navigation intents by default", () => {
    const policy = { mode: "safe_only" };

    assert.equal(evaluateActionSafetyPolicy(policy, "inspect_ui").allowed, true);
    assert.equal(evaluateActionSafetyPolicy(policy, "navigate").allowed, true);
    assert.equal(
      evaluateActionSafetyPolicy(policy, "take_screenshot").allowed,
      true,
    );
  });

  it("blocks destructive or externally visible intents in safe_only mode", () => {
    const policy = { mode: "safe_only" };

    assert.equal(evaluateActionSafetyPolicy(policy, "purchase").allowed, false);
    assert.match(
      evaluateActionSafetyPolicy(policy, "send_message").reason,
      /always forbidden/,
    );
    assert.equal(
      evaluateActionSafetyPolicy(policy, "reset_demo_workspace").allowed,
      false,
    );
  });

  it("permits explicit project intents while preserving forbidden intents", () => {
    const policy = {
      mode: "allow_project_actions",
      allowedIntents: ["reset_demo_workspace"],
      forbiddenIntents: ["archive_demo_project", "take_screenshot"],
    };

    assert.equal(
      evaluateActionSafetyPolicy(policy, "reset_demo_workspace").allowed,
      true,
    );
    assert.equal(
      evaluateActionSafetyPolicy(policy, "archive_demo_project").allowed,
      false,
    );
    assert.equal(
      evaluateActionSafetyPolicy(policy, "take_screenshot").allowed,
      false,
    );
    assert.equal(evaluateActionSafetyPolicy(policy, "purchase").allowed, false);
  });
});

describe("Mobile Device Driver runtime tools", () => {
  it("executes safe model-facing tools through the driver", async () => {
    const tools = createMobileDeviceRuntimeTools(createMockMobileDeviceDriver(), {
      mode: "safe_only",
    });

    const inspect = await tools.inspectUi({ interactiveOnly: true });
    const tap = await tools.tap({ target: 'id="start-button"' });
    const text = await tools.enterText({
      target: 'id="email"',
      text: "qa@example.com",
    });
    const back = await tools.goBack();
    const deeplink = await tools.openDeepLink({ url: "example://profile" });
    const screenshot = await tools.takeScreenshot({
      path: "artifacts/qa-agent/android.png",
    });

    for (const result of [inspect, tap, text, back, deeplink, screenshot]) {
      assert.equal(result.ok, true);
      assert.match(result.result.command, /agent-device/);
    }
  });

  it("blocks unsafe model-facing tools before they reach the driver", async () => {
    const tools = createMobileDeviceRuntimeTools(createMockMobileDeviceDriver(), {
      mode: "safe_only",
    });

    const result = await tools.tap({
      target: 'label="Buy now"',
      intent: "purchase",
    });

    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.match(result.reason, /always forbidden/);
  });

  it("lets configured project intents use tools without allowing forbidden intents", async () => {
    const tools = createMobileDeviceRuntimeTools(createMockMobileDeviceDriver(), {
      mode: "allow_project_actions",
      allowedIntents: ["reset_demo_workspace"],
      forbiddenIntents: [],
    });

    const allowed = await tools.tap({
      target: 'label="Reset demo workspace"',
      intent: "reset_demo_workspace",
    });
    const forbidden = await tools.tap({
      target: 'label="Submit order"',
      intent: "submit_order",
    });

    assert.equal(allowed.ok, true);
    assert.equal(forbidden.ok, false);
    assert.match(forbidden.reason, /always forbidden/);
  });
});
