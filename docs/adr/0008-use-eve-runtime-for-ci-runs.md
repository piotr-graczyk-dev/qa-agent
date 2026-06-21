# Use Eve runtime for CI runs

The v1 `@qa-agent/expo run` command runs the QA Agent through the official Eve runtime/session contract inside the same EAS job, rather than implementing a separate AI SDK loop. This keeps CI execution aligned with Eve tools, stream events, secret boundaries, and the future hosted-agent path.
