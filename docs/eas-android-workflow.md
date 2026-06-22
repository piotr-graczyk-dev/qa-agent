# Expo/EAS QA Workflows

QA Agent v1 supports the Android Expo/EAS path first. The iOS simulator path is
available as an experimental workflow so the same QA Report and comment model
can be exercised for iOS, but it has not been fully dogfooded yet.

The generated Android workflow orchestrates one pull request QA Run:

1. Check out the repository and install Node dependencies.
2. Write minimal GitHub PR Context to `qa-agent/pr-context.json`.
3. Provision `agent-device` before invoking QA Agent.
4. Run `qa-agent doctor`.
5. Install and launch the Android APK.
6. Run `qa-agent run` and write `artifacts/qa-agent/android/qa-report.json`.
7. Render or update the single GitHub QA Agent pull request comment.

The generated experimental iOS workflow mirrors that path for a simulator build:

1. Check out the repository and install Node dependencies.
2. Write minimal GitHub PR Context to `qa-agent/pr-context.json`.
3. Provision `agent-device` before invoking QA Agent.
4. Run `qa-agent doctor`.
5. Install and launch the iOS simulator app.
6. Run `qa-agent run --platform ios` and write
   `artifacts/qa-agent/ios/qa-report.json`.
7. Render or update the same stable QA Agent pull request comment.

Both generated platform workflows call `render-comment` with any Android and
iOS report artifacts that are present, so reviewers see one combined Android/iOS
QA Agent comment when both reports are available.

## Required EAS and GitHub setup

- Configure an EAS Android build profile that produces an APK for QA. The
  example app uses the `preview` profile with `android.buildType: "apk"`.
- Configure an EAS iOS simulator build profile before using the experimental
  iOS path. The generated workflow uses the `preview` profile name and expects
  that profile to produce a simulator build.
- Make the APK path available to the workflow as `QA_AGENT_ANDROID_APK_PATH`.
  This can point at the current EAS build output or a downloaded preview build.
- Make the iOS simulator app path available as `QA_AGENT_IOS_APP_PATH`.
- Set `QA_AGENT_ANDROID_APPLICATION_ID` to the Android application id from
  `qa-agent.config.mjs`.
- Set `QA_AGENT_IOS_BUNDLE_IDENTIFIER` to the iOS bundle identifier from
  `qa-agent.config.mjs`.
- Ensure the workflow has a `GITHUB_TOKEN` that can read pull request metadata
  and create or update issue comments.
- Set the model API key secret named by `model.apiKeyEnv`, for example
  `QA_AGENT_MODEL_API_KEY`.
- Set every Auth Profile secret environment variable referenced by
  `authProfiles`, for example `QA_AGENT_EXAMPLE_EMAIL` and
  `QA_AGENT_EXAMPLE_PASSWORD` in `examples/expo-basic`.

## Manual steps after `qa-agent init`

- Replace `TODO_MODEL_PROVIDER`, `TODO_MODEL_ID`, and
  `TODO_EAS_PROJECT_ID` in `qa-agent.config.mjs`.
- Replace `TODO_ANDROID_APPLICATION_ID` in both `qa-agent.config.mjs` and the
  generated EAS workflow.
- Replace `TODO_ANDROID_APK_PATH` in the generated workflow with the APK path
  exposed by your EAS build or download step.
- To enable iOS, add `ios` to `targetPlatforms` or switch to `["ios"]`, replace
  `TODO_IOS_BUNDLE_IDENTIFIER`, configure a simulator build profile, and replace
  `TODO_IOS_SIMULATOR_APP_PATH` in the experimental iOS workflow.
- Keep `scripts/qa-agent/provision-tooling.sh` before `qa-agent doctor` and
  `qa-agent run`; `run` expects `agent-device` to already be available.
- Keep `scripts/qa-agent/prepare-android-app.sh` before `qa-agent run`; the
  agent starts Black-Box QA only after the app is installed and launched.
- Keep `scripts/qa-agent/prepare-ios-app.sh` before iOS `qa-agent run`; the
  agent uses the same Mobile Device Driver and QA Report contract for iOS.

The workflow is advisory by default. Use Strict Mode only after the QA signal is
trusted enough to fail pull request checks.
