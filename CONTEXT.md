# QA Agent

This context defines the product language for an open-source mobile QA agent for Expo applications.

## Language

**CI Runner QA Agent**:
An agent that runs inside a mobile CI job and performs a lightweight black-box QA pass against an already installed and launched mobile application.
_Avoid_: Railway-first agent, hosted agent, test runner

**Black-Box QA**:
Mobile quality assessment based on pull request metadata and live application behavior, without using application source code as the primary evidence.
_Avoid_: code review, static analysis

**QA Hint**:
A project-provided natural-language suggestion that helps the CI Runner QA Agent choose high-signal mobile flows during a QA Run.
_Avoid_: test step, assertion, test case

**Agent Login**:
The QA Agent's ability to authenticate into the mobile application through configured login profiles while keeping credentials out of model-visible context.
_Avoid_: bootstrap-only auth, model-visible credentials

**Auth Profile**:
A named configuration that describes how the QA Agent should log in during a QA Run, including which secret environment variables and UI hints to use.
_Avoid_: hardcoded credentials, login script

**Login Type**:
The supported authentication pattern used by an Auth Profile. v1 supports `email_password`, `magic_link_deeplink`, and `otp_command`.
_Avoid_: auth provider, identity provider

**Hosted QA Agent**:
A future mode where the agent is deployed as a persistent service that coordinates QA runs but still delegates mobile device execution to CI infrastructure.
_Avoid_: v1 agent, self-contained mobile runner

**QA Run**:
A single automated review of a mobile app build for one pull request and one target platform.
_Avoid_: test suite, E2E run

**Exploration Budget**:
The configured limits that bound how much of the mobile application the QA Agent may explore during a QA Run.
_Avoid_: QA mode, coverage guarantee

**QA Report**:
The compact result of a QA Run, including status, summary, checks performed, issues found, and screenshot evidence.
_Avoid_: test log, artifact dump

**PR Context**:
The minimal pull request metadata used by the QA Agent to infer relevant mobile checks, including title, body, labels, branches, and changed file paths.
_Avoid_: full diff, code review context

**Screenshot Storage**:
The configured destination for screenshot evidence captured during a QA Run, such as workflow artifacts or an external blob provider.
_Avoid_: image upload, report storage

**Action Safety Policy**:
The configured rule for whether the QA Agent may perform potentially destructive or externally visible actions during a QA Run.
_Avoid_: exploration mode, permission prompt

**QA Status**:
The outcome classification for a QA Report. v1 uses `passed`, `failed`, `blocked`, and `unsure`.
_Avoid_: test result, check conclusion

**Strict Mode**:
An opt-in policy that makes selected QA Status values fail the CI workflow instead of only appearing in the QA Report.
_Avoid_: default gate, required check

**QA Agent CLI**:
The primary user interface for installing, configuring, checking, and running the CI Runner QA Agent inside an Expo application repository.
_Avoid_: library API, SDK-only integration

**QA Agent Config**:
The single typed configuration file that defines how the QA Agent CLI runs QA Runs for an Expo application.
_Avoid_: package.json config, workflow-only config

**QA Agent Init**:
The CLI command that scaffolds the files needed to run the CI Runner QA Agent in an Expo application repository.
_Avoid_: project generator, EAS project creator

**Expo EAS Integration**:
The v1 product boundary where the QA Agent CLI supports Expo applications running QA Runs through EAS Workflows.
_Avoid_: generic React Native integration, generic CI integration

**Mobile Device Driver**:
The automation backend used by the QA Agent to inspect and interact with a running mobile application. v1 uses `agent-device`.
_Avoid_: E2E framework, test backend

**Target Platform**:
One mobile operating system that a QA Run verifies for a pull request. v1 supports Android and iOS, while projects may enable either one or both.
_Avoid_: device type, runner type
