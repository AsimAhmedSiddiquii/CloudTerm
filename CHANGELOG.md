# Changelog

## [0.1.0] - 2026-10-08

### Added

- Interactive SSH sessions with robust connecting, connected, failed, and disconnected states.
- Host-key fingerprint verification with `known_hosts` persistence.
- Encrypted local SSH key vault with encrypted-key passphrase prompts.
- SSH key manager and reusable vault key references.
- Split terminal workspace with up to four panes.
- SFTP browsing, uploads, and downloads.
- AWS EC2 discovery through the standard local AWS credential chain.
- SSH config import from `~/.ssh/config`.
- Bastion/jump-host connections through SSH `direct-tcpip` channels.
- Local SSH port forwarding with automatic cleanup on disconnect.
- Per-connection timeout and keep-alive settings.
- Metadata-only connection backup and restore.
- Portable Windows ZIP packaging and a cross-platform release workflow with checksum and package validation.

### Changed

- Encrypted vault and connection-backup writes now flush durable temporary files before replacement.
- Backup imports validate connection metadata and avoid duplicate saved profiles.
- Key management warns before deleting keys referenced by saved connections and clears stale keys after unlock failures.
- Tagged releases publish the verified Windows, macOS, and Linux artifacts with consistent version metadata.

### Release notes

- The portable Windows package is not an MSI/NSIS installer.
- Windows code signing and signed automatic updates are not configured yet.
- Clean-machine installer and end-to-end SSH/SFTP/forwarding tests remain release gates.
- AWS discovery requires credentials available through the local AWS SDK credential chain.
