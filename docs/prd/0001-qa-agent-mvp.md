# QA Agent MVP PRD

## Problem Statement

Mobile teams increasingly receive pull requests that change user-facing application behavior, but reviewers often have to judge those changes from code alone or from manually provided screenshots. Backend changes can usually rely on integration tests, while mobile UI changes still need a device-level check to catch broken layouts, incorrect states, launch failures, missing authentication flows, or platform-specific regressions.

For Expo teams using EAS Workflows, the infrastructure to build, reuse, repack, install, and launch mobile apps already exists, but turning that infrastructure into a repeatable Black-Box QA loop still requires significant glue code. Teams need a lightweight CI Runner QA Agent that can run on pull requests, inspect an already launched mobile app, log in safely when configured, capture screenshot evidence, and publish one useful QA Report where reviewers already work.

## Solution

Build `qa-agent`, an open-source CLI and packaged Eve runtime for mobile pull request QA. The MVP is an Expo EAS Integration: a CI Runner QA Agent that initializes an Android-first EAS workflow, validates project configuration, runs a QA Run through the Eve runtime in the same EAS job, drives the app through `agent-device`, produces a validated QA Report, stores screenshots as artifacts by default, and upserts one GitHub pull request comment.

The first release is not a general React Native test framework, not a deterministic E2E DSL, and not a hosted control plane. It is a pragmatic QA loop for Expo apps on EAS Workflows, with a neutral `qa-agent` product name and an adapter-oriented internal structure so future adapters can be added without renaming the project.

## User Stories

1. As an Expo maintainer, I want to add QA Agent to my repository with one initializer command, so that I do not have to hand-write the EAS workflow and agent setup.
2. As an Expo maintainer, I want QA Agent to generate a typed QA Agent Config, so that my team can review and version the QA behavior.
3. As an Expo maintainer, I want QA Agent Init to generate an EAS workflow, so that pull requests can run mobile QA automatically.
4. As an Expo maintainer, I want QA Agent Init to support Android-only setup first, so that I can prove value before paying for iOS runner time.
5. As an Expo maintainer, I want QA Agent to support Android and iOS Target Platforms, so that the same reporting model can cover both mobile platforms.
6. As an Expo maintainer, I want `doctor` to validate missing config and environment variables before a QA Run, so that expensive CI failures happen less often.
7. As an Expo maintainer, I want `doctor` to detect missing `agent-device`, so that mobile automation failures are reported clearly.
8. As an Expo maintainer, I want `doctor` to validate configured model credentials by environment variable name, so that model setup problems are caught early.
9. As an Expo maintainer, I want the EAS workflow to provision `agent-device` before `run`, so that the QA Run consumes a prepared environment.
10. As an Expo maintainer, I want the QA Run to reuse EAS build primitives, so that native rebuilds are avoided where EAS can safely reuse or repack builds.
11. As an Expo maintainer, I want the app installed and launched before the agent starts exploring, so that the model does not guess install commands or artifact paths.
12. As a reviewer, I want one PR comment with the latest QA Report, so that I do not have to search across multiple workflow artifacts or comments.
13. As a reviewer, I want the PR comment to include platform status, summary, issues, checks performed, and screenshots, so that I can quickly evaluate the change.
14. As a reviewer, I want the comment to be updated instead of duplicated, so that the pull request discussion remains readable.
15. As a reviewer, I want `unsure` to be an explicit QA Status, so that the agent can be honest when evidence is incomplete.
16. As a reviewer, I want screenshot evidence, so that I can inspect the actual mobile UI state observed by the QA Agent.
17. As a developer, I want QA Agent to use PR Context from title, body, labels, branches, and changed file paths, so that the agent checks relevant app areas without reading the full source diff.
18. As a developer, I want QA Hints in config, so that I can guide the agent toward important flows without writing a test DSL.
19. As a developer, I want an Exploration Budget, so that I can control the maximum steps, screenshots, and duration of a QA Run.
20. As a developer, I want the default Action Safety Policy to be `safe_only`, so that QA Agent avoids destructive or externally visible actions by default.
21. As a developer, I want to opt into allowed project actions, so that safe test-environment side effects can be exercised when explicitly configured.
22. As a developer, I want Agent Login with email and password, so that QA Agent can verify authenticated screens.
23. As a developer, I want Agent Login credentials referenced by secret environment variable names, so that credentials are never committed to the repository.
24. As a developer, I want the model to call `login_with_profile` by profile name, so that raw credentials are not passed through model-visible context.
25. As a developer, I want login tools to redact secrets from outputs and logs, so that CI traces and PR comments do not expose sensitive data.
26. As a developer, I want `magic_link_deeplink` and `otp_command` Login Types in the v1 schema, so that common deterministic auth test hooks have a place in the model.
27. As a developer, I want SMS and email inbox adapters tracked separately, so that the MVP can ship without blocking on provider-specific inbox integrations.
28. As a developer, I want additional login providers tracked separately, so that OAuth, SSO, passkeys, and other flows can be designed after the core Auth Profile contract is stable.
29. As a developer, I want `run-local`, so that I can debug the QA Agent against an already launched simulator or emulator without waiting for a full EAS workflow.
30. As a developer, I want local debug mode to use the same config and QA Report contract as CI, so that local findings map to CI behavior.
31. As a developer, I want explicit model provider configuration, so that data routing and model cost are intentional choices.
32. As a developer, I want initializer presets for model providers, so that setup is guided without hiding provider choice.
33. As a package maintainer, I want the Eve agent runtime packaged inside `qa-agent`, so that prompts, tools, report behavior, and security fixes can be updated through package releases.
34. As a package maintainer, I want `run` to use the Eve runtime/session contract, so that CI behavior aligns with future hosted-agent behavior.
35. As a package maintainer, I want `write_report` to be the only valid QA Run completion path, so that downstream reporting is structured and testable.
36. As a package maintainer, I want invalid or missing reports to become blocked reports with diagnostics, so that failures are visible and actionable.
37. As a package maintainer, I want artifact Screenshot Storage as the default, so that the MVP works without third-party storage.
38. As a package maintainer, I want optional Vercel Blob screenshot storage, so that teams can show inline images in PR comments when they configure a provider.
39. As a package maintainer, I want storage providers to be pluggable later, so that S3, R2, and GCS can be added without changing report semantics.
40. As a package maintainer, I want the repository to use `packages/cli`, so that the product name stays adapter-neutral.
41. As a package maintainer, I want the Expo/EAS integration implemented as an adapter, so that future GitHub Actions and bare React Native adapters can be added cleanly.
42. As a package maintainer, I want a small Expo example app, so that the initializer, doctor, local mode, Agent Login, screenshot capture, and report rendering can be dogfooded.
43. As a package maintainer, I want contract evals first, so that report, safety, auth secrecy, and comment behavior are verified before expensive visual/mobile evals.
44. As an open-source contributor, I want a small predictable example app, so that I can reproduce QA Agent behavior without needing a private mobile project.
45. As an open-source contributor, I want clear MVP boundaries, so that I do not accidentally expand the first release into a hosted platform or general E2E framework.
46. As an open-source user, I want the product named QA Agent rather than Expo Agent, so that future adapter support does not require a rename.
47. As an open-source user, I want the README to state that v1 is Expo/EAS-only, so that the neutral product name does not imply unsupported adapters.
48. As a team lead, I want QA Agent to be advisory by default, so that early probabilistic QA does not become a flaky merge blocker.
49. As a team lead, I want Strict Mode as an opt-in policy, so that my team can fail CI on selected QA Status values once we trust the signal.
50. As a team lead, I want run artifacts and PR comments to avoid exposing secrets, so that QA Agent can be used safely in preview environments.

## Implementation Decisions

- The public product name is QA Agent. The package and binary should use neutral `qa-agent` naming, while v1 support remains limited to Expo/EAS.
- The repository should use a small monorepo with a single CLI package and an Expo/EAS adapter inside it. The example app should live separately for dogfooding.
- The primary user interface is the QA Agent CLI, not a library API. The core commands are `init`, `doctor`, `run`, `run-local`, `github-context`, and `render-comment`.
- QA Agent Init scaffolds project configuration, EAS workflow files, and supporting scripts. It does not create an EAS project, commit changes, add secrets, change application source code, or infer production identifiers without user input.
- The packaged agent runtime lives inside the `qa-agent` package. User projects configure the runtime rather than copying Eve agent internals into their repositories.
- `run` uses the official Eve runtime/session contract inside the same EAS job. The implementation may start a temporary local Eve runtime, but that is hidden behind the CLI.
- The v1 Mobile Device Driver is `agent-device` only. Other automation backends are out of scope for the MVP.
- The EAS workflow provisions `agent-device` before `run`. `doctor` verifies the driver and environment; `run` consumes the prepared environment and does not repair missing tooling.
- v1 supports Expo/EAS only. Future adapters are tracked separately for GitHub Actions, bare React Native, and hosted control-plane mode.
- The QA Agent Config is one typed config file covering app identifiers, EAS settings, enabled Target Platforms, model config, Auth Profiles, QA Hints, Exploration Budget, Action Safety Policy, Screenshot Storage, and report policy.
- Model provider, model id, and API key environment variable must be configured explicitly. Initializer presets can guide setup, but no hidden production model default should be used.
- PR Context is a small JSON artifact containing provider, repository, pull request number, title, body, labels, branch refs, and changed file paths. Full diffs are not included by default.
- Black-Box QA is the default evidence model. The agent uses PR Context, QA Hints, live UI snapshots, screenshots, and tool results rather than source-code analysis.
- QA Hints are natural-language guidance, not deterministic test steps or assertions.
- Exploration Budget directly controls steps, screenshots, and duration. There are no separate exploration modes; a "crawl" preset may simply expand the budget.
- Action Safety Policy is separate from Exploration Budget. The default is `safe_only`; projects can opt into `allow_project_actions` with allowed and forbidden intents.
- Agent Login is part of v1. Auth Profiles describe Login Type, secret environment variable names, and UI hints.
- v1 Login Types are `email_password`, `magic_link_deeplink`, and `otp_command`. SMS/email inbox adapters and additional login providers are tracked outside the MVP.
- Raw credentials, tokens, OTP provider credentials, and secret values must stay out of model-visible context. Tools read secrets from environment variables and return redacted results.
- The only valid completion path for a QA Run is exactly one validated `write_report` call.
- QA Status values are `passed`, `failed`, `blocked`, and `unsure`.
- Missing or invalid reports become `blocked` reports with diagnostics.
- QA Agent is advisory by default. Strict Mode can make selected statuses fail CI later, with `failed` as the default fail-on status when enabled.
- Screenshot Storage defaults to workflow artifacts. Vercel Blob is the first optional provider for inline PR images. The storage interface should leave room for S3, R2, and GCS later.
- `render-comment` upserts one GitHub PR comment using a stable marker instead of creating a new comment for every run.
- Local debug mode assumes the app and device are already running. It does not build, install, or provision devices.
- The MVP includes a small Expo example app for dogfooding the initializer, doctor, Agent Login, screenshots, local mode, and report rendering.

## Testing Decisions

- Tests should verify external behavior at the highest useful seam rather than implementation details. For the CLI, that means command outcomes, generated files, validated reports, and rendered comments rather than internal function calls.
- The highest seam for initialization is the CLI command that produces project files from a fixture Expo app. Tests should assert generated config, workflow, and scripts without depending on private implementation structure.
- The highest seam for validation is `doctor` run against fixture projects. Tests should cover missing EAS profile, missing app identifiers, missing model env names, missing auth env names, missing `agent-device`, and invalid screenshot storage config.
- The highest seam for QA execution is `run` against a mocked Mobile Device Driver and mocked Eve/tool environment. Tests should verify that a PR Context plus config produces exactly one valid QA Report.
- The Agent Login seam should be the `login_with_profile` tool contract. Tests should prove that secrets are read from environment variables, are not accepted as model-supplied input, and are redacted from outputs.
- The Action Safety Policy seam should be tool-level intent classification. Tests should prove that `safe_only` blocks destructive or externally visible intents while allowing navigation, inspection, login, and screenshots.
- The report seam should be the validated `write_report` contract. Tests should cover every QA Status and invalid/missing report fallback.
- The comment seam should be `render-comment` using report fixtures. Tests should verify marker-based upsert behavior and stable rendering of Android-only and Android+iOS reports.
- The screenshot seam should be Screenshot Storage provider behavior. Tests should cover artifact storage as default and provider configuration validation for Vercel Blob.
- The PR Context seam should be the `github-context` command. Tests should cover minimal JSON shape and ensure full diffs are not included by default.
- Contract evals should cover status classification, missing evidence producing `unsure`, missing auth producing `blocked`, safe action refusal, secret redaction, and exactly-once report writing.
- The example Expo app should be used for dogfooding and later mobile evals, but full visual regression testing is not required for the MVP.
- Existing Eve project seams should be respected: authored tools, runtime session contract, and structured tool outputs should be preferred over new bespoke agent-loop abstractions.

## Out of Scope

- Hosted QA Agent mode, Railway deployment, dashboards, or persistent control-plane features.
- Generic React Native support outside Expo/EAS.
- GitHub Actions mobile adapter.
- Bare React Native adapter.
- Non-EAS CI providers.
- Mobile automation backends other than `agent-device`.
- Deterministic test DSLs, scripted assertions, or replacement for Maestro, Detox, Appium, XCUITest, or Espresso.
- Full source diff analysis or code review behavior by default.
- SMS and email inbox adapters.
- Social login, OAuth, SSO, passkeys, captcha support, or real 2FA flows.
- Storage providers beyond artifact storage and optional Vercel Blob.
- Full mobile visual regression system.
- Long-running autonomous app crawling as a distinct product mode.
- Automatic creation of EAS projects, GitHub secrets, production app credentials, or production test accounts.

## Further Notes

- The MVP should be Android-first for the proof path while preserving the report and config model for Android+iOS.
- The README should be explicit that the product name is neutral, but v1 support is Expo/EAS-only.
- The example app should remain small, predictable, and purpose-built for dogfooding rather than becoming a showcase.
- Future backlog items already exist for additional login profile types, SMS/email inbox adapters, GitHub Actions adapter, bare React Native adapter, and hosted control-plane mode.
- The current repository is still an Eve scaffold. Implementation should reshape it into the agreed `packages/cli` monorepo while preserving the domain glossary and ADR decisions.
