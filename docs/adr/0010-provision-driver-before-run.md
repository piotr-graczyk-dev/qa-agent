# Provision driver before run

The v1 EAS workflow provisions `agent-device` before invoking `@qa-agent/expo run`. The `doctor` command verifies the driver and environment, while `run` consumes the prepared environment instead of installing or repairing missing mobile automation tooling.
