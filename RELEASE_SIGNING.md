# Release signing checklist

CloudTerm currently produces unsigned installers. Complete this checklist before
publishing a public release.

## Windows Authenticode

1. Obtain an Authenticode certificate from the chosen code-signing provider.
2. Store the PFX material and password in the repository's protected release
   environment; never commit either value.
3. Configure the Windows release environment with the base64-encoded PFX in
   `WINDOWS_CERTIFICATE_BASE64` and its password in
   `WINDOWS_CERTIFICATE_PASSWORD`. The release workflow imports the certificate
   only for the job, signs both MSI and NSIS artifacts with SHA-256, and verifies
   them before checksums are generated.
4. Verify the MSI and NSIS artifacts with Windows signature verification on a
   clean machine.

## Tauri updater signing

1. Generate a dedicated updater key pair with the Tauri CLI and keep the private
   key in a protected secret store. Losing the private key prevents updates to
   already-installed clients.
2. Configure the repository variable `CLOUDTERM_UPDATER_PUBLIC_KEY` with the
   generated public key. CloudTerm injects it into tagged builds without
   storing it in the repository; the updater endpoint is the GitHub Release
   `latest.json` asset.
3. Configure the release environment with:
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
4. The tagged workflow enables updater artifact generation through
   `src-tauri/tauri.release.conf.json` and publishes each platform's signed
   bundle, signature file, and generated `latest.json` manifest.
5. Exercise an update from the previous release on Windows, macOS, and Linux;
   verify that an invalid signature is rejected.

## Release workflow policy

- Keep build jobs read-only; only the release publisher needs repository write
  permission.
- The tagged release workflow requires the repository variable
  `CLOUDTERM_PUBLIC_RELEASE_READY=true` before it publishes a GitHub Release.
  Leave it unset or false while signing, clean-machine, and upgrade validation
  are incomplete; tagged builds will stop before publication. Tagged builds also
  fail earlier when the Windows signing secrets are missing, while manual
  workflow runs may still produce unsigned validation packages.
- Do not publish a broad public release until code signing, update signing,
  installer upgrade/uninstall validation, clean-machine validation, and the
  end-to-end SSH/SFTP/forwarding/backup pass are complete.
- Keep SHA-256 manifests alongside every published package.
