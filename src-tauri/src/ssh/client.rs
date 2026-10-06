use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use serde::Serialize;

use russh::{
    client,
    keys::{
        decode_secret_key,
        key::PrivateKeyWithHashAlg,
        PublicKeyOrCertificate,
    },
    ChannelMsg, ChannelWriteHalf, Disconnect,
};
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Mutex};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyPrompt {
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub fingerprint: String,
}

struct Client {
    app: AppHandle,
    session_id: String,
    host: String,
    port: u16,
    decision: Option<oneshot::Receiver<bool>>,
}

impl client::Handler for Client {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let public_key = server_public_key.public_key();

        match russh::keys::known_hosts::check_known_hosts(
            &self.host,
            self.port,
            &public_key,
        ) {
            Ok(true) => return Ok(true),
            Ok(false) => {}
            Err(error) => {
                log::warn!("Unable to check known_hosts: {error}");
                return Ok(false);
            }
        }

        let prompt = HostKeyPrompt {
            session_id: self.session_id.clone(),
            host: self.host.clone(),
            port: self.port,
            fingerprint: public_key
                .fingerprint(russh::keys::HashAlg::Sha256)
                .to_string(),
        };
        let _ = self.app.emit("ssh-host-key", &prompt);

        let accepted = match self.decision.take() {
            Some(receiver) => receiver.await.unwrap_or(false),
            None => false,
        };

        if accepted {
            if let Err(error) = russh::keys::known_hosts::learn_known_hosts(
                &self.host,
                self.port,
                &public_key,
            ) {
                log::warn!("Unable to save known host: {error}");
                return Ok(false);
            }
        }

        Ok(accepted)
    }
}

struct ActiveSession {
    session: client::Handle<Client>,
    writer: ChannelWriteHalf<client::Msg>,
}

#[derive(Default)]
pub struct SshState {
    active: Mutex<HashMap<String, ActiveSession>>,
    pending_host_keys: Mutex<HashMap<String, oneshot::Sender<bool>>>,
}

pub async fn connect_interactive(
    app: AppHandle,
    state: &SshState,
    session_id: String,
    host: String,
    port: u16,
    username: String,
    key_contents: String,
    cols: u32,
    rows: u32,
) -> Result<()> {
    if session_id.trim().is_empty() {
        bail!("Session id is required");
    }
    if host.trim().is_empty() {
        bail!("Host is required");
    }
    if username.trim().is_empty() {
        bail!("Username is required");
    }

    let key_pair = decode_secret_key(&key_contents, None)
        .context("Unable to decode the imported SSH key")?;
    let config = Arc::new(client::Config::default());
    let (decision_tx, decision_rx) = oneshot::channel();
    state
        .pending_host_keys
        .lock()
        .await
        .insert(session_id.clone(), decision_tx);

    let mut session = match client::connect(
        config,
        (host.as_str(), port),
        Client {
            app: app.clone(),
            session_id: session_id.clone(),
            host: host.clone(),
            port,
            decision: Some(decision_rx),
        },
    )
    .await
    .with_context(|| format!("Unable to connect to {}:{}", host, port))
    {
        Ok(session) => session,
        Err(error) => {
            state.pending_host_keys.lock().await.remove(&session_id);
            return Err(error);
        }
    };

    state.pending_host_keys.lock().await.remove(&session_id);

    let hash_alg = session.best_supported_rsa_hash().await?.flatten();
    let auth = session
        .authenticate_publickey(
            username,
            PrivateKeyWithHashAlg::new(Arc::new(key_pair), hash_alg),
        )
        .await?;
    if !auth.success() {
        bail!("SSH authentication failed");
    }

    let channel = session
        .channel_open_session()
        .await
        .context("Unable to create SSH channel")?;
    channel
        .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
        .await?;
    channel.request_shell(false).await?;
    let (mut reader, writer) = channel.split();

    if let Some(old) = state.active.lock().await.insert(
        session_id.clone(),
        ActiveSession { session, writer },
    ) {
        let _ = old.writer.close().await;
        let _ = old
            .session
            .disconnect(Disconnect::ByApplication, "Replacing terminal", "English")
            .await;
    }

    tokio::spawn(async move {
        let output_event = format!("ssh-output:{session_id}");
        let closed_event = format!("ssh-closed:{session_id}");
        while let Some(message) = reader.wait().await {
            match message {
                ChannelMsg::Data { data } | ChannelMsg::ExtendedData { data, .. } => {
                    let _ = app.emit(&output_event, data.to_vec());
                }
                ChannelMsg::ExitStatus { exit_status } => {
                    let _ = app.emit(&format!("ssh-exit:{session_id}"), exit_status);
                }
                ChannelMsg::Close => break,
                _ => {}
            }
        }
        let _ = app.emit(&closed_event, ());
    });

    Ok(())
}

pub async fn host_key_decision(
    state: &SshState,
    session_id: String,
    accepted: bool,
) -> Result<()> {
    if let Some(sender) = state.pending_host_keys.lock().await.remove(&session_id) {
        let _ = sender.send(accepted);
    }
    Ok(())
}

pub async fn send_input(
    state: &SshState,
    session_id: String,
    data: String,
) -> Result<()> {
    let active = state.active.lock().await;
    active
        .get(&session_id)
        .context("No active SSH session")?
        .writer
        .data_bytes(data.into_bytes())
        .await?;
    Ok(())
}

pub async fn resize_terminal(
    state: &SshState,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<()> {
    let active = state.active.lock().await;
    active
        .get(&session_id)
        .context("No active SSH session")?
        .writer
        .window_change(cols, rows, 0, 0)
        .await?;
    Ok(())
}

pub async fn disconnect(state: &SshState, session_id: String) -> Result<()> {
    if let Some(session) = state.active.lock().await.remove(&session_id) {
        let _ = session.writer.close().await;
        session
            .session
            .disconnect(Disconnect::ByApplication, "User disconnected", "English")
            .await?;
    }
    Ok(())
}
