# Release signing checklist

CloudTerm currently produces unsigned installers. Complete this checklist before
publishing a public release.

## Windows Authenticode

1. Obtain an Authenticode certificate from the chosen code-signing provider.
2. Store the PFX material and password in the repository's protected release
   environment; never commit either value.
3. Configure the Windows release job to import the certificate into the runner,
   set the Tauri Windows certificate thumbprint, and use an RFC 3161 timestamp
   service.
4. Verify the MSI and NSIS artifacts with Windows signature verification on a
   clean machine.

## Tauri updater signing

1. Generate a dedicated updater key pair with the Tauri CLI and keep the private
   key in a protected secret store. Losing the private key prevents updates to
   already-installed clients.
2. Add the generated public key and an HTTPS update endpoint to the Tauri updater
   configuration.
3. Configure the release environment with:
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
4. Enable updater artifact generation in the release build and publish each
   platform's signed bundle and signature file together with its update manifest.
5. Exercise an update from the previous release on Windows, macOS, and Linux;
   verify that an invalid signature is rejected.

## Release workflow policy

- Keep build jobs read-only; only the release publisher needs repository write
  permission.
- The tagged release workflow requires the repository variable
  `CLOUDTERM_PUBLIC_RELEASE_READY=true` before it publishes a GitHub Release.
  Leave it unset or false while signing, clean-machine, and upgrade validation
  are incomplete; tagged builds will still build and validate packages but will
  stop before publication.
- Do not publish a broad public release until code signing, update signing,
  installer upgrade/uninstall validation, clean-machine validation, and the
  end-to-end SSH/SFTP/forwarding/backup pass are complete.
- Keep SHA-256 manifests alongside every published package.
