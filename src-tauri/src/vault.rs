use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit},
};
use anyhow::{Context, Result};
use argon2::Argon2;
use rand::RngExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

const SALT_LENGTH: usize = 16;
const NONCE_LENGTH: usize = 12;

#[derive(Default)]
pub struct VaultState {
    pub lock: Mutex<()>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultKey {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct VaultFile {
    salt: Vec<u8>,
    entries: HashMap<String, VaultEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VaultEntry {
    name: String,
    ciphertext: Vec<u8>,
}

fn vault_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(app
        .path()
        .app_local_data_dir()
        .context("Unable to resolve the CloudTerm data directory")?
        .join("cloudterm-keys.vault"))
}

fn load_vault(path: &PathBuf) -> Result<VaultFile> {
    if !path.exists() {
        return Ok(VaultFile::default());
    }

    let bytes = fs::read(path).context("Unable to read the encrypted key vault")?;
    serde_json::from_slice(&bytes).context("The encrypted key vault is corrupted")
}

pub fn is_initialized(app: &AppHandle) -> Result<bool> {
    let path = vault_path(app)?;
    if !path.exists() {
        return Ok(false);
    }

    let vault = load_vault(&path)?;
    Ok(vault.salt.len() == SALT_LENGTH)
}

fn save_vault(path: &PathBuf, vault: &VaultFile) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).context("Unable to create the CloudTerm data directory")?;
    }

    let bytes = serde_json::to_vec_pretty(vault)?;
    let temporary_path = path.with_extension("vault.tmp");
    let write_result = (|| -> Result<()> {
        let mut temporary_file = fs::File::create(&temporary_path)
            .context("Unable to create the encrypted key vault temporary file")?;
        temporary_file
            .write_all(&bytes)
            .context("Unable to write the encrypted key vault")?;
        temporary_file
            .sync_all()
            .context("Unable to flush the encrypted key vault")?;
        Ok(())
    })();
    if let Err(error) = write_result {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }

    if let Err(replace_error) = fs::rename(&temporary_path, path) {
        if path.exists() {
            fs::remove_file(path).context("Unable to replace the encrypted key vault")?;
            fs::rename(&temporary_path, path)
                .context("Unable to finalize the encrypted key vault")?;
        } else {
            let _ = fs::remove_file(&temporary_path);
            return Err(replace_error).context("Unable to finalize the encrypted key vault");
        }
    }

    #[cfg(unix)]
    if let Some(parent) = path.parent() {
        fs::File::open(parent)
            .and_then(|directory| directory.sync_all())
            .context("Unable to flush the encrypted key vault directory")?;
    }

    Ok(())
}

fn fresh_salt() -> Vec<u8> {
    let mut salt = vec![0u8; SALT_LENGTH];
    rand::rng().fill(salt.as_mut_slice());
    salt
}

fn ensure_salt(vault: &mut VaultFile) -> Result<bool> {
    if vault.salt.len() == SALT_LENGTH {
        return Ok(false);
    }

    if vault.entries.is_empty() {
        vault.salt = fresh_salt();
        return Ok(true);
    }

    anyhow::bail!(
        "The encrypted SSH key vault has invalid metadata. Existing encrypted keys were preserved, but cannot be unlocked without the original vault file."
    )
}

fn encryption_key(password: &str, salt: &[u8]) -> Result<[u8; 32]> {
    if salt.len() != SALT_LENGTH {
        anyhow::bail!("The encrypted SSH key vault has invalid salt metadata");
    }

    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|error| anyhow::anyhow!("Unable to derive vault key: {error}"))?;
    Ok(key)
}

fn nonce(bytes: &[u8]) -> Result<Nonce<aes_gcm::aead::consts::U12>> {
    Nonce::try_from(bytes).map_err(|_| anyhow::anyhow!("Invalid encryption nonce"))
}

pub async fn import_key(
    app: AppHandle,
    state: &VaultState,
    path: String,
    name: String,
    password: String,
) -> Result<VaultKey> {
    let _guard = state.lock.lock().await;
    if password.trim().is_empty() {
        anyhow::bail!("Vault password is required");
    }
    let source =
        fs::read_to_string(&path).with_context(|| format!("Unable to read SSH key: {path}"))?;
    let file_path = vault_path(&app)?;
    let mut vault = load_vault(&file_path)?;

    ensure_salt(&mut vault)?;

    let key = encryption_key(&password, &vault.salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|error| anyhow::anyhow!("Unable to initialize vault encryption: {error}"))?;

    if let Some(existing) = vault.entries.values().next() {
        if existing.ciphertext.len() <= NONCE_LENGTH {
            anyhow::bail!("The encrypted SSH key vault is corrupted");
        }
        cipher
            .decrypt(
                &nonce(&existing.ciphertext[..NONCE_LENGTH])?,
                &existing.ciphertext[NONCE_LENGTH..],
            )
            .map_err(|_| anyhow::anyhow!("Incorrect vault password"))?;
    }
    let mut nonce_bytes = [0u8; NONCE_LENGTH];
    rand::rng().fill(&mut nonce_bytes);
    let ciphertext = cipher
        .encrypt(&nonce(&nonce_bytes)?, source.as_bytes())
        .map_err(|_| anyhow::anyhow!("Unable to encrypt SSH key"))?;

    let mut id_bytes = [0u8; 16];
    rand::rng().fill(&mut id_bytes);
    let id = id_bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let key_name = if name.trim().is_empty() {
        "Imported SSH key".to_string()
    } else {
        name.trim().to_string()
    };
    let mut stored = nonce_bytes.to_vec();
    stored.extend(ciphertext);
    vault.entries.insert(
        id.clone(),
        VaultEntry {
            name: key_name.clone(),
            ciphertext: stored,
        },
    );
    save_vault(&file_path, &vault)?;

    Ok(VaultKey { id, name: key_name })
}

pub async fn read_key(
    app: AppHandle,
    state: &VaultState,
    id: String,
    password: String,
) -> Result<String> {
    let _guard = state.lock.lock().await;
    if password.trim().is_empty() {
        anyhow::bail!("Vault password is required");
    }
    let vault = load_vault(&vault_path(&app)?)?;
    let entry = vault
        .entries
        .get(&id)
        .context("SSH key was not found in the vault")?;
    let key = encryption_key(&password, &vault.salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|error| anyhow::anyhow!("Unable to initialize vault encryption: {error}"))?;

    if entry.ciphertext.len() <= NONCE_LENGTH {
        anyhow::bail!("The encrypted SSH key is corrupted");
    }

    let plaintext = cipher
        .decrypt(
            &nonce(&entry.ciphertext[..NONCE_LENGTH])?,
            &entry.ciphertext[NONCE_LENGTH..],
        )
        .map_err(|_| anyhow::anyhow!("Incorrect vault password"))?;
    String::from_utf8(plaintext).context("The stored SSH key is not valid text")
}

pub async fn list_keys(
    app: AppHandle,
    state: &VaultState,
    password: String,
) -> Result<Vec<VaultKey>> {
    let _guard = state.lock.lock().await;
    if password.trim().is_empty() {
        anyhow::bail!("Vault password is required");
    }

    let file_path = vault_path(&app)?;
    let mut vault = load_vault(&file_path)?;
    if ensure_salt(&mut vault)? {
        save_vault(&file_path, &vault)?;
    }
    let key = encryption_key(&password, &vault.salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|error| anyhow::anyhow!("Unable to initialize vault encryption: {error}"))?;

    if let Some(existing) = vault.entries.values().next() {
        if existing.ciphertext.len() <= NONCE_LENGTH {
            anyhow::bail!("The encrypted SSH key vault is corrupted");
        }
        cipher
            .decrypt(
                &nonce(&existing.ciphertext[..NONCE_LENGTH])?,
                &existing.ciphertext[NONCE_LENGTH..],
            )
            .map_err(|_| anyhow::anyhow!("Incorrect vault password"))?;
    }

    Ok(vault
        .entries
        .into_iter()
        .map(|(id, entry)| VaultKey {
            id,
            name: entry.name,
        })
        .collect())
}

pub async fn delete_key(
    app: AppHandle,
    state: &VaultState,
    id: String,
    password: String,
) -> Result<()> {
    let _guard = state.lock.lock().await;
    if password.trim().is_empty() {
        anyhow::bail!("Vault password is required");
    }

    let file_path = vault_path(&app)?;
    let mut vault = load_vault(&file_path)?;
    if !vault.entries.contains_key(&id) {
        anyhow::bail!("SSH key was not found in the vault");
    }
    ensure_salt(&mut vault)?;
    let key = encryption_key(&password, &vault.salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|error| anyhow::anyhow!("Unable to initialize vault encryption: {error}"))?;

    if let Some(existing) = vault.entries.values().next() {
        if existing.ciphertext.len() <= NONCE_LENGTH {
            anyhow::bail!("The encrypted SSH key vault is corrupted");
        }
        cipher
            .decrypt(
                &nonce(&existing.ciphertext[..NONCE_LENGTH])?,
                &existing.ciphertext[NONCE_LENGTH..],
            )
            .map_err(|_| anyhow::anyhow!("Incorrect vault password"))?;
    }

    vault.entries.remove(&id);
    save_vault(&file_path, &vault)
}
