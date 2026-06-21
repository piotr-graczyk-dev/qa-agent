#!/usr/bin/env bash
set -euo pipefail

echo "Provisioning QA Agent tooling for Android dogfooding."

require_command() {
  local command_name="$1"
  local install_hint="$2"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required before running QA Agent. $install_hint" >&2
    exit 1
  fi
}

require_env() {
  local env_name="$1"
  local setup_hint="$2"

  if [[ -z "${!env_name:-}" ]]; then
    echo "$env_name is required for the Expo dogfood Auth Profile. $setup_hint" >&2
    exit 1
  fi
}

require_command "node" "Use the EAS Node image or install Node before this step."
require_command "agent-device" "Install agent-device for Android before qa-agent run."

if ! agent-device --version >/dev/null 2>&1; then
  echo "agent-device is installed but did not respond to --version." >&2
  exit 1
fi

require_env "QA_AGENT_EXAMPLE_EMAIL" "Set it to qa@example.test for deterministic dogfooding."
require_env "QA_AGENT_EXAMPLE_PASSWORD" "Set it to qa-agent-password for deterministic dogfooding."

echo "QA Agent dogfood prerequisites are available."
