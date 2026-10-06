import {
    FormEvent,
    useState,
} from "react";

import {
    open,
} from "@tauri-apps/plugin-dialog";

import type {
    ConnectionDraft,
    SavedConnection,
} from "../types/connection";

interface Props {
    initialConnection?: SavedConnection | null;

    onConnect: (
        connection: ConnectionDraft
    ) => void;

    onSave: (
        connection: ConnectionDraft,
        existingId?: string
    ) => Promise<void>;
}

export default function AwsConnectionForm({
    initialConnection,
    onConnect,
    onSave,
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

    const [keyPath, setKeyPath] = useState(
        initialConnection?.keyPath ?? ""
    );

    const [error, setError] =
        useState("");

    const [saved, setSaved] =
        useState(false);

    async function choosePem() {
        try {
            setError("");

            const selected =
                await open({
                    multiple: false,
                    directory: false,

                    title:
                        "Select AWS PEM Key",

                    filters: [
                        {
                            name:
                                "SSH Private Key",

                            extensions: [
                                "pem",
                                "key",
                            ],
                        },
                    ],
                });

            if (
                typeof selected ===
                "string"
            ) {
                setKeyPath(selected);
            }
        } catch (err) {
            setError(
                `Unable to select key: ${String(
                    err
                )}`
            );
        }
    }

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

        if (!keyPath) {
            setError(
                "Select a PEM key."
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

            keyPath,
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

                    <label>
                        SSH Private Key
                    </label>

                    <div className="key-row">

                        <input
                            value={keyPath}
                            readOnly
                            placeholder="Select AWS .pem file"
                        />

                        <button
                            type="button"
                            className="secondary-button"
                            onClick={choosePem}
                        >
                            Browse
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