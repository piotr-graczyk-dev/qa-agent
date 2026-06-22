#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local env_name="$1"
  local help="$2"

  if [[ -z "${!env_name:-}" ]]; then
    echo "$env_name is required. $help" >&2
    exit 1
  fi
}

require_env "QA_AGENT_IOS_APP_PATH" "Set it to the iOS simulator .app produced or downloaded by the EAS workflow."
require_env "QA_AGENT_IOS_BUNDLE_IDENTIFIER" "Set it to the iOS bundle identifier from qa-agent.config.mjs."

if ! command -v agent-device >/dev/null 2>&1; then
  echo "agent-device must be provisioned before preparing the iOS QA app." >&2
  exit 1
fi

if [[ ! -e "$QA_AGENT_IOS_APP_PATH" ]]; then
  echo "iOS simulator app not found at QA_AGENT_IOS_APP_PATH=$QA_AGENT_IOS_APP_PATH" >&2
  exit 1
fi

echo "Installing iOS QA app from $QA_AGENT_IOS_APP_PATH."
agent-device install "$QA_AGENT_IOS_BUNDLE_IDENTIFIER" "$QA_AGENT_IOS_APP_PATH" --platform ios --session qa-agent-ios

echo "Launching iOS QA app $QA_AGENT_IOS_BUNDLE_IDENTIFIER."
agent-device open "$QA_AGENT_IOS_BUNDLE_IDENTIFIER" --platform ios --session qa-agent-ios

echo "iOS QA app is installed and launched."
