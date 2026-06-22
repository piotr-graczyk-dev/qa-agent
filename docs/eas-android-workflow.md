# Android EAS QA Workflow

QA Agent v1 supports the Android Expo/EAS path first. The generated workflow
orchestrates one pull request QA Run:

1. Check out the repository and install Node dependencies.
2. Write minimal GitHub PR Context to `qa-agent/pr-context.json`.
3. Provision `agent-device` before invoking QA Agent.
4. Run `qa-agent doctor`.
5. Install and launch the Android APK.
6. Run `qa-agent run` and write `artifacts/qa-agent/android/qa-report.json`.
7. Render or update the single GitHub QA Agent pull request comment.

## Required EAS and GitHub setup

- Configure an EAS Android build profile that produces an APK for QA. The
  example app uses the `preview` profile with `android.buildType: "apk"`.
- Make the APK path available to the workflow as `QA_AGENT_ANDROID_APK_PATH`.
  This can point at the current EAS build output or a downloaded preview build.
- Set `QA_AGENT_ANDROID_APPLICATION_ID` to the Android application id from
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
- Keep `scripts/qa-agent/provision-tooling.sh` before `qa-agent doctor` and
  `qa-agent run`; `run` expects `agent-device` to already be available.
- Keep `scripts/qa-agent/prepare-android-app.sh` before `qa-agent run`; the
  agent starts Black-Box QA only after the app is installed and launched.

The workflow is advisory by default. Use Strict Mode only after the QA signal is
trusted enough to fail pull request checks.
