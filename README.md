# QA Agent

QA Agent is an open-source CI Runner QA Agent for Expo teams using EAS Workflows. It runs a lightweight Black-Box QA pass against an already installed and launched mobile app, writes a validated QA Report, stores screenshots as workflow artifacts by default, and updates one GitHub pull request comment.

The package and CLI use the neutral name `qa-agent`, but v1 is intentionally Expo/EAS-only. It is not a hosted QA platform, a generic React Native adapter, a deterministic E2E framework, or a replacement for tools such as Maestro, Detox, Appium, XCUITest, or Espresso.

## Product Value

Mobile pull requests often need device-level evidence before reviewers can trust UI, login, layout, and launch behavior. QA Agent gives reviewers a compact PR comment with platform status, summary, checks performed, issues found, and screenshot evidence without asking the model to review source diffs.

QA Agent is advisory by default. Teams can inspect reports first and choose later whether to make selected statuses fail CI through Strict Mode.

## MVP Scope

Supported in v1:

- Expo apps running on EAS Workflows.
- Android-first QA workflow generation, with an experimental iOS simulator path.
- Minimal GitHub PR Context from title, body, labels, branch refs, and changed file paths.
- The `agent-device` Mobile Device Driver.
- Artifact screenshot storage by default, with optional Vercel Blob metadata.
- Agent Login through configured Auth Profiles with secret isolation.
- One marker-based GitHub PR comment rendered from Android and/or iOS QA Reports.

Out of scope for the MVP:

- Hosted QA Agent mode or persistent dashboards.
- Generic React Native, bare React Native, GitHub Actions, or non-EAS CI adapters.
- Mobile automation backends other than `agent-device`.
- SMS/email inbox adapters, OAuth, SSO, passkeys, captcha, or real 2FA flows.
- Deterministic test DSLs, scripted assertions, full source diff review, and full visual regression testing.
- Automatic EAS project creation, GitHub secret creation, production app credentials, or production test accounts.

## Setup Flow

1. Install dependencies and build the CLI in this repository:

   ```sh
   npm ci
   npm run build --workspace qa-agent
   ```

2. In an Expo project, run init:

   ```sh
   npx qa-agent init --project .
   ```

3. Fill in `qa-agent.config.mjs` with model, EAS, app id, screenshot storage, Action Safety Policy, and Auth Profile settings.

4. Configure EAS workflows and secrets, then run doctor before the first QA Run:

   ```sh
   npx qa-agent doctor --project .
   ```

5. Generate PR Context, run QA Agent, and render the single PR comment inside EAS:

   ```sh
   npx qa-agent github-context --project . --repo owner/repo --pr 123 --out qa-agent/pr-context.json
   npx qa-agent run --project . --platform android --pr-context qa-agent/pr-context.json --out artifacts/qa-agent/android
   npx qa-agent render-comment --project . --android-report artifacts/qa-agent/android/qa-report.json --repo owner/repo --pr 123
   ```

## Required Secrets and Environment

- `GITHUB_TOKEN` for PR metadata and marker-based comment upsert.
- The model API key named by `model.apiKeyEnv`, for example `QA_AGENT_MODEL_API_KEY`.
- `QA_AGENT_ANDROID_APK_PATH` and `QA_AGENT_ANDROID_APPLICATION_ID` for the Android EAS workflow.
- For experimental iOS, `QA_AGENT_IOS_APP_PATH` and `QA_AGENT_IOS_BUNDLE_IDENTIFIER`.
- Every Auth Profile secret env var, such as `QA_AGENT_EXAMPLE_EMAIL` and `QA_AGENT_EXAMPLE_PASSWORD` in the example app.
- `agent-device` available on `PATH`; generated workflows provision it before running `doctor` and `run`.

## Android-First Recommendation

Start with Android. The generated Android workflow is the primary MVP proof path and usually costs less to dogfood. Enable the experimental iOS simulator workflow after Android reports are stable and EAS can reliably produce an iOS simulator app artifact for QA Agent to install and launch.

## Documentation

- [Product language](CONTEXT.md)
- [MVP PRD](docs/prd/0001-qa-agent-mvp.md)
- [Architecture decisions](docs/adr/)
- [Expo/EAS workflow setup](docs/eas-android-workflow.md)
- [Experimental iOS workflow](docs/eas-ios-workflow.md)
- [Example Expo app](examples/expo-basic/README.md)
- [Release checklist](docs/release-checklist.md)

## Local Validation

```sh
npm ci
npm run typecheck
npm test
npm run eval:contracts
npm run build
git diff --check
bash -n examples/expo-basic/scripts/qa-agent/provision-tooling.sh
bash -n examples/expo-basic/scripts/qa-agent/prepare-android-app.sh
bash -n examples/expo-basic/scripts/qa-agent/prepare-ios-app.sh
ls -l examples/expo-basic/scripts/qa-agent/provision-tooling.sh examples/expo-basic/scripts/qa-agent/prepare-android-app.sh examples/expo-basic/scripts/qa-agent/prepare-ios-app.sh
```
