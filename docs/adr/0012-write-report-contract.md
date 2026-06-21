# Validated write_report contract

The v1 QA Agent must finish each QA Run by calling `write_report` exactly once with a validated QA Report payload. Pull request comments and future dashboards render from this structured report rather than free-form model text, and missing or invalid reports become blocked reports with diagnostics.
