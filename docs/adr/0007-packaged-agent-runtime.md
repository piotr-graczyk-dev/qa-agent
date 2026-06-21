# Packaged agent runtime

The v1 QA Agent keeps the Eve agent runtime inside the `qa-agent` package, while `init` generates only project configuration, EAS workflow files, and supporting scripts. This keeps security fixes, prompts, tools, and report behavior updatable through package releases, with an optional eject path reserved for advanced customization later.
