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

require_env "QA_AGENT_ANDROID_APK_PATH" "Set it to the Android APK produced or downloaded by the EAS workflow."
require_env "QA_AGENT_ANDROID_APPLICATION_ID" "Set it to the Android application id from qa-agent.config.mjs."

if ! command -v agent-device >/dev/null 2>&1; then
  echo "agent-device must be provisioned before preparing the Android QA app." >&2
  exit 1
fi

if [[ ! -f "$QA_AGENT_ANDROID_APK_PATH" ]]; then
  echo "Android APK not found at QA_AGENT_ANDROID_APK_PATH=$QA_AGENT_ANDROID_APK_PATH" >&2
  exit 1
fi

echo "Installing Android QA app from $QA_AGENT_ANDROID_APK_PATH."
agent-device install "$QA_AGENT_ANDROID_APPLICATION_ID" "$QA_AGENT_ANDROID_APK_PATH" --platform android --session qa-agent-android

echo "Launching Android QA app $QA_AGENT_ANDROID_APPLICATION_ID."
agent-device open "$QA_AGENT_ANDROID_APPLICATION_ID" --platform android --session qa-agent-android

echo "Android QA app is installed and launched."
