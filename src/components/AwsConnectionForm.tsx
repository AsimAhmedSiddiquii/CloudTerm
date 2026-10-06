import { useState } from "react";
import type { FormEvent } from "react";

import {
    open,
} from "@tauri-apps/plugin-dialog";

import type {
    ConnectionDraft,
    SavedConnection,
} from "../types/connection";
import { importKey } from "../services/keyVault";

interface Props {
    initialConnection?: SavedConnection | null;

    onConnect: (
        connection: ConnectionDraft
    ) => void;

    onSave: (
        connection: ConnectionDraft,
        existingId?: string
    ) => Promise<void>;

    onVaultPasswordChange: (password: string) => void;
}

export default function AwsConnectionForm({
    initialConnection,
    onConnect,
    onSave,
    onVaultPasswordChange,
}: Props) {
    const [name, setName] = useState(
        initialConnection?.name ?? ""
    );

    const [host, setHost] = useState(
        initialConnection?.host ?? ""
    );

    const [port, setPort] = useState(
        initialConnection?.port ?? 22
    );

    const [username, setUsername] = useState(
        initialConnection?.username ?? "ubuntu"
    );

    const [keyId, setKeyId] = useState(
        initialConnection?.keyId ?? ""
    );

    const [keyName, setKeyName] = useState(
        initialConnection?.keyName ?? ""
    );

    const [vaultPassword, setVaultPassword] = useState("");

    const [keyPath, setKeyPath] = useState("");

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

                    <div className="key-row">

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
