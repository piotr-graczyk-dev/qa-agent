# Exploration budget and action safety

The v1 QA Agent uses an Exploration Budget rather than separate exploration modes, so projects can tune steps, screenshots, and duration directly. Potentially destructive or externally visible actions are controlled by a separate Action Safety Policy, keeping runtime cost decisions separate from safety decisions.
