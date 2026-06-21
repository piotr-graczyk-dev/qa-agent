#!/usr/bin/env bash
set -euo pipefail

echo "Provisioning QA Agent tooling for Android dogfooding."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required before running QA Agent." >&2
  exit 1
fi

echo "TODO: install and verify agent-device for Android before qa-agent run."
echo "TODO: configure dogfood credentials through environment variables or EAS secrets."
