# QA Agent Expo Basic

This is the small Expo app used to dogfood QA Agent setup and contributor
reproduction. It is intentionally plain: the app provides stable screens and
test states for Agent Login, screenshots, empty/list rendering, and controlled
failure reporting.

## Included surfaces

- Public screen visible without auth.
- Login-required private checklist.
- Empty state and list state inside the authenticated area.
- Controlled failure mode that exposes a known visual inconsistency.
- Deterministic dogfood credentials:
  - Email: `qa@example.test`
  - Password: `qa-agent-password`

## QA Agent setup

The example includes:

- `qa-agent.config.mjs` using the v1 `expo-eas` adapter.
- `.eas/workflows/qa-agent-android.yml` for Android-first EAS dogfooding.
- `qa-agent/pr-context.json` as a deterministic PR Context fixture.
- `scripts/qa-agent/provision-tooling.sh` as the same provisioning hook that
  `qa-agent init` creates.
- `eas.json` with a `preview` build profile.

The Auth Profile references environment variables instead of committing real
secrets:

```sh
export QA_AGENT_EXAMPLE_EMAIL=qa@example.test
export QA_AGENT_EXAMPLE_PASSWORD=qa-agent-password
```

For local config validation, install the repo dependencies, build the CLI, and
run doctor from the repository root with `agent-device` available:

```sh
npm run build --workspace qa-agent
npx qa-agent doctor --project examples/expo-basic
```

The checked-in PR Context is a local dogfood fixture. Replace it with generated
pull request metadata before using this example as a real project template.

The example is not a product showcase and should stay compact. Add only the
screens or deterministic states needed to reproduce QA Agent behavior.
