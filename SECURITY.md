# Security policy

## Reporting a vulnerability

Please do not disclose a suspected vulnerability in a public issue or include sensitive project data in a report. Use the repository's [private vulnerability reporting page](https://github.com/ChefMooon/plankplan-studio/security/advisories/new) if private reporting is enabled. If it is unavailable, contact the repository owner privately through an available channel before sharing technical details; no dedicated security email or response-time commitment is currently published.

Include the affected version or commit, impact, reproduction steps, and a minimal example with sensitive data removed. The maintainer can coordinate a fix and disclosure after assessing the report. Do not access other users' data or disrupt services to demonstrate an issue.

## Scope and limitations

This repository currently contains a browser-side application with local project storage and no application backend or accounts. Imported JSON is untrusted input, and browser storage and exported backups are accessible to whoever has access to the browser profile or files. Keep backups protected and use a trusted browser and device.

There is no published supported-version or security-update schedule yet. Review the deployed version and its hosting configuration separately; this document does not assert an independent security audit.
