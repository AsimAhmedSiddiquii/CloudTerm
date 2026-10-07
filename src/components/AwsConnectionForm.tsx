import { useState } from "react";
import type { FormEvent } from "react";

import {
    open,
} from "@tauri-apps/plugin-dialog";

import type {
    ConnectionDraft,
    BastionConfig,
    SavedConnection,
} from "../types/connection";
import { importKey } from "../services/keyVault";
import type { ImportedKey } from "../services/keyVault";

interface Props {
    initialConnection?: SavedConnection | null;
    prefill?: Partial<ConnectionDraft> | null;

    onConnect: (
        connection: ConnectionDraft
    ) => void;

    onSave: (
        connection: ConnectionDraft,
        existingId?: string
    ) => Promise<void>;

    onVaultPasswordChange: (password: string) => void;
    availableKeys: ImportedKey[];
    onKeyImported: (key: ImportedKey) => void;
}

export default function AwsConnectionForm({
    initialConnection,
    prefill,
    onConnect,
    onSave,
    onVaultPasswordChange,
    availableKeys,
    onKeyImported,
}: Props) {
    const [name, setName] = useState(
        initialConnection?.name ?? prefill?.name ?? ""
    );

    const [host, setHost] = useState(
        initialConnection?.host ?? prefill?.host ?? ""
    );

    const [port, setPort] = useState(
        initialConnection?.port ?? prefill?.port ?? 22
    );

    const [commandOnConnect, setCommandOnConnect] = useState(
        initialConnection?.commandOnConnect ?? prefill?.commandOnConnect ?? ""
    );

    const [connectTimeoutSeconds, setConnectTimeoutSeconds] = useState(
        initialConnection?.connectTimeoutSeconds ?? prefill?.connectTimeoutSeconds ?? 20
    );
    const [keepAliveSeconds, setKeepAliveSeconds] = useState(
        initialConnection?.keepAliveSeconds ?? prefill?.keepAliveSeconds ?? 30
    );

    const [username, setUsername] = useState(
        initialConnection?.username ?? prefill?.username ?? "ubuntu"
    );

    const [keyId, setKeyId] = useState(
        initialConnection?.keyId ?? ""
    );

    const [keyName, setKeyName] = useState(
        initialConnection?.keyName ?? ""
    );

    const [vaultPassword, setVaultPassword] = useState("");

    const [keyPath, setKeyPath] = useState("");

    const [useBastion, setUseBastion] = useState(Boolean(initialConnection?.bastion));
    const [bastionHost, setBastionHost] = useState(initialConnection?.bastion?.host ?? "");
    const [bastionPort, setBastionPort] = useState(initialConnection?.bastion?.port ?? 22);
    const [bastionUsername, setBastionUsername] = useState(initialConnection?.bastion?.username ?? "ubuntu");
    const [bastionKeyId, setBastionKeyId] = useState(initialConnection?.bastion?.keyId ?? "");
    const [bastionKeyName, setBastionKeyName] = useState(initialConnection?.bastion?.keyName ?? "");

    const [importingKey, setImportingKey] = useState(false);

    function updateVaultPassword(password: string) {
        setVaultPassword(password);
        onVaultPasswordChange(password);
    }

    async function importPem() {
        if (!vaultPassword) {
            setError("Enter a vault password before importing a key.");
            return;
        }

        try {
            setImportingKey(true);
            setError("");
            const selected = await open({
                multiple: false,
                directory: false,
                title: "Import SSH Private Key",
                filters: [{ name: "SSH Private Key", extensions: ["pem", "key"] }],
            });

            if (typeof selected === "string") {
                const imported = await importKey(
                    vaultPassword,
                    selected.split(/[\\/]/).pop()?.replace(/\.(pem|key)$/i, "") ?? "Imported SSH key",
                    selected
                );
                setKeyId(imported.id);
                setKeyName(imported.name);
                setKeyPath(selected);
                onKeyImported(imported);
            }
        } catch (err) {
            setError(`Unable to import key: ${String(err)}`);
        } finally {
            setImportingKey(false);
        }
    }

    const [error, setError] =
        useState("");

    const [saved, setSaved] =
        useState(false);

    function getDraft():
        | ConnectionDraft
        | null {
        setError("");

        if (!host.trim()) {
            setError(
                "Host/IP is required."
            );

            return null;
        }

        if (!username.trim()) {
            setError(
                "Username is required."
            );

            return null;
        }

        if (!keyId) {
            setError(
                "Import an SSH key into the vault."
            );

            return null;
        }

        if (
            !Number.isFinite(port) ||
            port <= 0 ||
            port > 65535
        ) {
            setError(
                "Enter a valid SSH port."
            );

            return null;
        }

        let bastion: BastionConfig | undefined;
        if (useBastion) {
            if (!bastionHost.trim() || !bastionUsername.trim() || !bastionKeyId) {
                setError("Bastion host, username, and SSH key are required.");
                return null;
            }
            if (!Number.isFinite(bastionPort) || bastionPort <= 0 || bastionPort > 65535) {
                setError("Enter a valid bastion port.");
                return null;
            }
            bastion = {
                host: bastionHost.trim(),
                port: bastionPort,
                username: bastionUsername.trim(),
                keyId: bastionKeyId,
                keyName: bastionKeyName,
            };
        }

        return {
            name:
                name.trim() ||
                host.trim(),

            host:
                host.trim(),

            port,

            username:
                username.trim(),

            keyId,
            keyName,
            commandOnConnect: commandOnConnect.trim(),
            connectTimeoutSeconds,
            keepAliveSeconds,
            bastion,
        };
    }

    function connect(
        event: FormEvent
    ) {
        event.preventDefault();

        const draft =
            getDraft();

        if (!draft) {
            return;
        }

        onConnect(draft);
    }

    async function save() {
        const draft =
            getDraft();

        if (!draft) {
            return;
        }

        try {
            await onSave(
                draft,
                initialConnection?.id
            );

            setSaved(true);

            setTimeout(() => {
                setSaved(false);
            }, 2000);
        } catch (err) {
            setError(
                `Could not save connection: ${String(
                    err
                )}`
            );
        }
    }

    async function saveAndConnect() {
        const draft =
            getDraft();

        if (!draft) {
            return;
        }

        try {
            await onSave(
                draft,
                initialConnection?.id
            );

            onConnect(draft);
        } catch (err) {
            setError(
                `Could not save connection: ${String(
                    err
                )}`
            );
        }
    }

    return (
        <div className="connection-page">
            <div className="connection-card">

                <div className="provider-header">
                    <div className="aws-logo">
                        AWS
                    </div>

                    <div>
                        <h1>
                            {initialConnection
                                ? "Edit AWS Connection"
                                : "New AWS Connection"}
                        </h1>
                        <p>
                            Connect to an EC2
                            instance using SSH.
                        </p>
                    </div>
                </div>

                <form onSubmit={connect}>

                    <label>
                        Connection Name
                    </label>

                    <input
                        value={name}
                        onChange={(e) =>
                            setName(
                                e.target.value
                            )
                        }
                        placeholder="Production Server"
                    />

                    <label>
                        Public IP / Hostname
                    </label>

                    <input
                        value={host}
                        onChange={(e) =>
                            setHost(
                                e.target.value
                            )
                        }
                        placeholder="13.233.120.20"
                    />

                    <div className="form-row">

                        <div>
                            <label>
                                Username
                            </label>

                            <input
                                value={username}
                                onChange={(e) =>
                                    setUsername(
                                        e.target.value
                                    )
                                }
                                placeholder="ubuntu"
                            />
                        </div>

                        <div className="port-field">

                            <label>
                                Port
                            </label>

                            <input
                                type="number"
                                value={port}
                                onChange={(e) =>
                                    setPort(
                                        Number(
                                            e.target.value
                                        )
                                    )
                                }
                            />

                        </div>

                    </div>

                    <label>Vault Password</label>

                    <input
                        type="password"
                        value={vaultPassword}
                        onChange={(e) => updateVaultPassword(e.target.value)}
                        placeholder="Required to unlock encrypted keys"
                    />

                    <label>Encrypted SSH Key</label>

                    <div className="key-selector-row">
                        <select
                            value={keyId}
                            onChange={(event) => {
                                const selected = availableKeys.find(
                                    (key) => key.id === event.target.value
                                );
                                setKeyId(event.target.value);
                                setKeyName(selected?.name ?? "");
                                setKeyPath("");
                            }}
                        >
                            <option value="">
                                {availableKeys.length ? "Select an imported key" : "No imported keys yet"}
                            </option>
                            {availableKeys.map((key) => (
                                <option value={key.id} key={key.id}>
                                    {key.name}
                                </option>
                            ))}
                        </select>

                        <input
                            value={keyName || keyPath}
                            readOnly
                            placeholder="No key imported"
                        />

                        <button
                            type="button"
                            className="secondary-button"
                            onClick={importPem}
                        >
                            {importingKey ? "Importing…" : "Import key"}
                        </button>

                    </div>

                    <label>Command on connect <span className="optional-label">Optional</span></label>

                    <input
                        value={commandOnConnect}
                        onChange={(event) => setCommandOnConnect(event.target.value)}
                        placeholder="e.g. cd /var/www/app"
                    />

                    <div className="form-row advanced-settings-row">
                        <div>
                            <label>Connection timeout (seconds)</label>
                            <input type="number" min="5" max="300" value={connectTimeoutSeconds} onChange={(event) => setConnectTimeoutSeconds(Number(event.target.value))} />
                        </div>
                        <div>
                            <label>Keep-alive interval (seconds)</label>
                            <input type="number" min="5" max="3600" value={keepAliveSeconds} onChange={(event) => setKeepAliveSeconds(Number(event.target.value))} />
                        </div>
                    </div>

                    <label className="checkbox-label">
                        <input type="checkbox" checked={useBastion} onChange={(event) => setUseBastion(event.target.checked)} />
                        Connect through a bastion / jump host
                    </label>

                    {useBastion && (
                        <div className="bastion-card">
                            <label>Bastion host</label>
                            <input value={bastionHost} onChange={(event) => setBastionHost(event.target.value)} placeholder="bastion.example.com" />
                            <div className="form-row">
                                <div><label>Bastion username</label><input value={bastionUsername} onChange={(event) => setBastionUsername(event.target.value)} placeholder="ubuntu" /></div>
                                <div className="port-field"><label>Port</label><input type="number" value={bastionPort} onChange={(event) => setBastionPort(Number(event.target.value))} /></div>
                            </div>
                            <label>Bastion SSH key</label>
                            <select value={bastionKeyId} onChange={(event) => { const selected = availableKeys.find((key) => key.id === event.target.value); setBastionKeyId(event.target.value); setBastionKeyName(selected?.name ?? ""); }}>
                                <option value="">Select an imported key</option>
                                {availableKeys.map((key) => <option value={key.id} key={key.id}>{key.name}</option>)}
                            </select>
                        </div>
                    )}

                    {error && (
                        <div className="form-error">
                            {error}
                        </div>
                    )}

                    {saved && (
                        <div className="form-success">
                            ✓ Connection saved
                        </div>
                    )}

                    <div className="connection-actions">

                        <button
                            type="button"
                            className="secondary-button"
                            onClick={save}
                        >
                            {initialConnection
                                ? "Update"
                                : "Save"}
                        </button>

                        <button
                            type="button"
                            className="primary-button"
                            onClick={
                                saveAndConnect
                            }
                        >
                            Save & Connect
                        </button>

                        <button
                            type="submit"
                            className="primary-button"
                        >
                            Connect
                        </button>

                    </div>

                </form>
            </div>
        </div>
    );
}
