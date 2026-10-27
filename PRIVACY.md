# Privacy

This document describes the application code in this repository. A particular deployment may use hosting, analytics, or other services configured outside this repository; its operator should document those separately before release.

## Data on your device

Projects, including names, notes, measurements, materials, prices, and optional 3D designs, are stored in the browser's IndexedDB on the current device. Preferences such as theme and workspace settings are stored in browser local storage. Older project data may also remain in local storage for migration and recovery.

The application currently has no accounts or cloud synchronization, and the repository contains no application analytics or project upload service. Your browser requests the application files from the hosting provider; the host may receive ordinary request information such as IP address and server logs according to its own configuration and policy. External links open third-party sites, which have their own practices.

## Backups and deletion

JSON exports contain project data and should be treated as files you control. Importing a file reads it in the browser. Deleting a project removes its current saved record, but exported files, browser backups, and retained legacy or recovery data may remain. Clearing site data can remove local projects, preferences, and recovery data; export any needed projects first. Browser tools and retention behavior vary. Data is not automatically available on another device.

This project has no published privacy contact or retention policy for a hosted service. The operator must supply those details and review this notice against the actual deployment before release.
