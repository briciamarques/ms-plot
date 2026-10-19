# Portable browser backups

Open **Backup and transfer saved data** at the bottom of the page.
Save current edits with the existing project save control before downloading.

- MS Generator: downloads every saved project, custom journal and figure-style preset, and default preset choice.
- MS Plot: downloads saved style presets. Export the current project separately with **Project → Save project file**.

Download from each original site address and browser profile where you saved data. Localhost and the hosted site have separate storage. Put backup files in your own Drive/OneDrive or another safe location. These files may contain research data; they are not uploaded by this feature.

On another computer open the same site and restore the backup. Restore refuses to overwrite different nonempty saved stores. Use an empty browser profile in that case. Restoration reloads the page after confirmation; save current edits first. Reopen MS Plot project files using **Open project file**.

This is manual backup and transfer, not automatic cloud synchronization. Original RAW files are not included. The Thermo reader still runs locally using ProteoWizard.

Validation: `node tests/browser-backup.cjs`.
