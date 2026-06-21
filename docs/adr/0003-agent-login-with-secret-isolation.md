# Agent Login with secret isolation

The v1 QA Agent will support Agent Login instead of requiring projects to pre-authenticate the app before QA starts. Login credentials remain in CI-managed secrets and are read only by tools, so the model can request a named Auth Profile without seeing raw passwords, tokens, or OTP provider credentials.
