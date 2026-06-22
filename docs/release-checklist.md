# Release Checklist

Use this checklist before cutting an MVP release or handing the repository to a future implementation agent.

## Local Validation

Run from the repository root:

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

The contract eval command gates the MVP behavior called out in the PRD and ADRs: exactly-once QA Report writing, QA Status classification, explicit `unsure` for missing evidence, `blocked` for missing auth, safe action refusal, and secret redaction.

## Manual EAS Dogfooding

1. Use the [example Expo app](../examples/expo-basic/README.md) or a small Expo app with deterministic login credentials.
2. Confirm `eas.json` has an Android preview profile that produces an APK.
3. Configure required secrets: `GITHUB_TOKEN`, the model API key named by `model.apiKeyEnv`, Auth Profile secrets, `QA_AGENT_ANDROID_APK_PATH`, and `QA_AGENT_ANDROID_APPLICATION_ID`.
4. Run the generated Android workflow and confirm it writes `artifacts/qa-agent/android/qa-report.json`, screenshot artifacts, and one updated GitHub PR comment.
5. If testing iOS, configure a simulator build profile, set `QA_AGENT_IOS_APP_PATH` and `QA_AGENT_IOS_BUNDLE_IDENTIFIER`, then run the experimental iOS workflow and confirm the same PR comment aggregates Android and iOS report sections.
6. Verify no raw credentials, tokens, OTP command values, or model credentials appear in logs, artifacts, or PR comments.

## Scope Guard

Before release, re-read:

- [MVP PRD](prd/0001-qa-agent-mvp.md)
- [MVP scope ADR](adr/0019-mvp-scope.md)
- [Packaged runtime ADR](adr/0007-packaged-agent-runtime.md)
- [Contract evals ADR](adr/0017-contract-evals-first.md)
- [Product name ADR](adr/0020-product-name-qa-agent.md)

Do not add hosted mode, non-EAS adapters, extra device drivers, inbox adapters, or deterministic test DSLs to the MVP release.
