# EAS iOS experimental workflow

QA Agent can run the same QA Report contract against iOS simulator builds, but
the iOS path is experimental until it has been fully dogfooded on EAS runners.
The Android workflow remains the primary proof path for the MVP.

## What the generated workflow does

1. Build an iOS simulator app with the EAS `preview` profile.
2. Write minimal GitHub PR Context to `qa-agent/pr-context.json`.
3. Provision QA Agent tooling and `agent-device`.
4. Run `qa-agent doctor` against the project config.
5. Install and launch the iOS simulator app with `prepare-ios-app.sh`.
6. Run `qa-agent run --platform ios` and write
   `artifacts/qa-agent/ios/qa-report.json`.
7. Render the single QA Agent PR comment. iOS-only runs may pass only
   `--ios-report`; multi-platform runs pass both Android and iOS report paths.

## Required setup

- Add `ios` to `targetPlatforms` in `qa-agent.config.mjs`.
- Add `app.ios.bundleIdentifier` to `qa-agent.config.mjs`.
- Configure the EAS profile to produce a simulator build, for example
  `ios.simulator: true` in `eas.json`.
- Set `QA_AGENT_IOS_APP_PATH` to the `.app` artifact produced or downloaded by
  the workflow.
- Set `QA_AGENT_IOS_BUNDLE_IDENTIFIER` to the bundle identifier from config.
- Keep the Android workflow producing `artifacts/qa-agent/android/qa-report.json`
  when using a multi-platform comment step that passes both reports.

Until iOS dogfooding is complete, treat failures from this workflow as advisory
signals and verify runner/device assumptions before making it a required check.
