# CloudTerm

CloudTerm is a cross-platform desktop SSH connection manager built with **Tauri**, **React**, **TypeScript**, **Rust**, **russh**, and **xterm.js**.

The current version focuses on **AWS EC2 SSH connections** using PEM/private key authentication.

## Current Features

- Connect to AWS EC2 instances over SSH
- PEM/private key authentication
- Interactive terminal powered by xterm.js
- Save SSH connections locally
- Persistent AWS connection sidebar
- Edit and delete saved connections
- Connection status indicators
- Host-key fingerprint verification with `known_hosts` support
- Encrypted local SSH key vault with passphrase-protected key support
- Up to four split terminal panes
- SFTP browser with upload and download
- Optional AWS EC2 instance discovery from the local AWS credential chain
- Import of common host entries from `~/.ssh/config`
- Optional bastion / jump-host routing for private targets
- Local SSH port forwarding with start/stop lifecycle controls
- Native desktop file picker for SSH keys
- Windows desktop application via Tauri

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- xterm.js

### Desktop

- Tauri 2

### Backend

- Rust
- russh
- Tokio

### Local Persistence

- Tauri Store

## Project Structure

```text
CloudTerm/
├── src/
│   ├── components/
│   │   ├── AwsConnectionForm.tsx
│   │   ├── Sidebar.tsx
│   │   └── TerminalView.tsx
│   ├── services/
│   │   └── connectionStore.ts
│   ├── types/
│   │   └── connection.ts
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   └── main.tsx
│
├── src-tauri/
│   ├── capabilities/
│   │   └── default.json
│   ├── src/
│   │   ├── ssh/
│   │   │   ├── mod.rs
│   │   │   └── client.rs
│   │   ├── lib.rs
│   │   └── main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── package.json
└── README.md
```

## Requirements

Install the following before running CloudTerm:

- Node.js
- npm
- Rust / Cargo
- Microsoft C++ Build Tools on Windows
- WebView2 Runtime on Windows

Verify Rust:

```powershell
rustc --version
cargo --version
```

## Install Dependencies

From the project root:

```powershell
npm install
```

## Run in Development

```powershell
npm run tauri dev
```

This launches the React frontend and the native Tauri desktop window.

## Using CloudTerm

Create a new AWS connection and enter:

- Connection name
- EC2 public IP or hostname
- SSH port, normally `22`
- SSH username
- An imported SSH key selected from the encrypted vault

Use **Discover EC2** in the sidebar to query instances using the standard AWS SDK credential chain. You can optionally enter an AWS profile and region. Selecting an instance opens a prefilled connection form; CloudTerm still requires you to choose the SSH key and username before connecting.

Common AWS usernames include:

```text
Ubuntu       ubuntu
Amazon Linux ec2-user
Debian       admin
CentOS       centos
```

The correct username depends on the EC2 AMI.

You can either:

- **Save** — store the connection without opening it
- **Connect** — connect without saving
- **Save & Connect** — persist the connection and immediately open the terminal

Saved connections appear in the AWS section of the sidebar.

Use **Import SSH config** to read host aliases from your local `~/.ssh/config`. CloudTerm imports the host, port, username, and identity-file hint into a new connection form; private keys must still be imported into the encrypted vault before connecting.

For private subnets, enable **Connect through a bastion / jump host** in the connection form. CloudTerm authenticates to the bastion, opens an SSH `direct-tcpip` channel to the target, and then performs the target host-key check and authentication through that tunnel.

For database or internal web services, open **Forward** from a terminal and choose a local bind address/port plus the remote host/port. Port `0` asks the operating system to choose an available local port. The forward is stopped automatically when the terminal disconnects.

## Build an Installable Desktop Application

First make sure the development build works:

```powershell
npm run tauri dev
```

Then create a production build:

```powershell
npm run tauri build
```

Tauri will compile the React frontend and Rust backend and generate release bundles.

On Windows, generated installers are normally available under:

```text
src-tauri\target\release\bundle\
```

Typical output directories include:

```text
bundle\msi\
bundle\nsis\
```

The release executable is also available at:

```text
src-tauri\target\release\
```

## Recommended Tauri Bundle Configuration

In `src-tauri/tauri.conf.json`, configure the application metadata before releasing:

```json
{
  "productName": "CloudTerm",
  "version": "0.1.0",
  "identifier": "com.entwicklera.cloudterm",
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

Then rebuild:

```powershell
npm run tauri build
```

## Windows Installation

After a successful build, open:

```text
src-tauri\target\release\bundle\
```

and install CloudTerm using the generated `.exe` or `.msi` installer.

Unsigned development builds may trigger Microsoft SmartScreen warnings. Code signing should be configured before distributing CloudTerm publicly.

For reproducible Windows installers, push a version tag such as `v0.1.0` or run the **Windows release** workflow manually in GitHub Actions. The workflow runs lint, frontend build, Rust tests, and produces MSI/NSIS artifacts.

## Security Notes

CloudTerm currently stores saved connection metadata locally.

Imported private keys are encrypted in the application data directory and connections store only a vault key identifier. The vault password is not persisted. Passphrases for encrypted OpenSSH keys are requested only for the active connection.

Remaining security improvements include:

- Windows Hello / biometric vault unlock
- SSH agent support

## Roadmap

### AWS

- [x] PEM authentication
- [x] Interactive SSH terminal
- [x] Saved connections
- [x] Sidebar connection manager
- [x] Edit/delete connection
- [x] Connection status
- [x] Encrypted SSH key vault
- [x] Host fingerprint verification
- [x] Multiple terminal panes
- [x] SFTP browser
- [x] SSH port forwarding
- [x] Bastion / jump host support
- [x] Import from `~/.ssh/config`
- [x] AWS account integration
- [x] Automatic EC2 discovery

### Future Cloud Providers

- [ ] Microsoft Azure
- [ ] Google Cloud Platform
- [ ] Generic VPS / Linux server
- [ ] DigitalOcean
- [ ] Hetzner

## Production Roadmap

Before publishing CloudTerm publicly:

1. Add encrypted private-key storage.
2. Implement SSH host-key verification.
3. Add application icons.
4. Add proper semantic versioning.
5. Add Windows code signing.
6. Test installer upgrades/uninstalls.
7. Test on a clean Windows machine.
8. Build macOS and Linux packages.
9. Add automatic updates.

The repository includes a Windows release workflow that automates the build and artifact upload. Code signing and update signing still need to be configured before public distribution.

## License

MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


## Developed By

**Asim Ahmed Siddiqui**

Custom software, automation, AI, and cloud solutions.
