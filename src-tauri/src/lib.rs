mod ssh;
mod vault;
mod aws;
mod ssh_config;

use serde::Deserialize;
use std::fs;

use ssh::client::SshState;

#[tauri::command]
async fn aws_discover_instances(
    request: aws::DiscoverRequest,
) -> Result<Vec<aws::Ec2Instance>, String> {
    aws::discover_instances(request)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn write_connection_backup(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|error| format!("Unable to write backup: {error}"))
}

#[tauri::command]
fn read_connection_backup(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|error| format!("Unable to read backup: {error}"))
}

#[tauri::command]
fn ssh_config_entries() -> Result<Vec<ssh_config::SshConfigEntry>, String> {
    ssh_config::list_entries().map_err(|error| error.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SshConnectionRequest {
    session_id: String,
    host: String,
    port: u16,
    username: String,
    key_contents: String,
    command_on_connect: String,
    cols: u32,
    rows: u32,
    bastion: Option<BastionRequest>,
    connect_timeout_seconds: Option<u64>,
    keep_alive_seconds: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BastionRequest {
    host: String,
    port: u16,
    username: String,
    key_contents: String,
}

#[tauri::command]
async fn connect_aws_ssh(
    request: SshConnectionRequest,
    app: tauri::AppHandle,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    ssh::client::connect_interactive(
        app,
        state.inner(),
        request.session_id,
        request.host,
        request.port,
        request.username,
        request.key_contents,
        request.command_on_connect,
        request.cols,
        request.rows,
        request.bastion.map(|bastion| ssh::client::BastionConnection {
            host: bastion.host,
            port: bastion.port,
            username: bastion.username,
            key_contents: bastion.key_contents,
        }),
        request.connect_timeout_seconds,
        request.keep_alive_seconds,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ssh_input(
    session_id: String,
    data: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    ssh::client::send_input(
        state.inner(),
        session_id,
        data,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ssh_resize(
    session_id: String,
    cols: u32,
    rows: u32,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    ssh::client::resize_terminal(
        state.inner(),
        session_id,
        cols,
        rows,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ssh_disconnect(
    session_id: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    ssh::client::disconnect(
        state.inner(),
        session_id,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ssh_start_local_forward(
    session_id: String,
    local_host: String,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
    state: tauri::State<'_, SshState>,
) -> Result<String, String> {
    ssh::client::start_local_forward(
        state.inner(), session_id, local_host, local_port, remote_host, remote_port,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ssh_stop_local_forward(
    session_id: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    ssh::client::stop_local_forward(state.inner(), session_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ssh_host_key_decision(
    session_id: String,
    accepted: bool,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    ssh::client::host_key_decision(state.inner(), session_id, accepted)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ssh_key_passphrase(
    session_id: String,
    passphrase: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    ssh::client::key_passphrase(state.inner(), session_id, passphrase)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn sftp_list(
    session_id: String,
    path: String,
    state: tauri::State<'_, SshState>,
) -> Result<Vec<ssh::client::RemoteEntry>, String> {
    ssh::client::sftp_list(state.inner(), session_id, path)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn sftp_download(
    session_id: String,
    remote_path: String,
    local_path: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    ssh::client::sftp_download(state.inner(), session_id, remote_path, local_path)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn sftp_upload(
    session_id: String,
    local_path: String,
    remote_path: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    ssh::client::sftp_upload(state.inner(), session_id, local_path, remote_path)
        .await
        .map_err(|error| error.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultImportRequest {
    path: String,
    name: String,
    password: String,
}

#[tauri::command]
async fn vault_import_key(
    request: VaultImportRequest,
    app: tauri::AppHandle,
    state: tauri::State<'_, vault::VaultState>,
) -> Result<vault::VaultKey, String> {
    vault::import_key(
        app,
        state.inner(),
        request.path,
        request.name,
        request.password,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn vault_read_key(
    id: String,
    password: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, vault::VaultState>,
) -> Result<String, String> {
    vault::read_key(app, state.inner(), id, password)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn vault_list_keys(
    password: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, vault::VaultState>,
) -> Result<Vec<vault::VaultKey>, String> {
    vault::list_keys(app, state.inner(), password)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn vault_delete_key(
    id: String,
    password: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, vault::VaultState>,
) -> Result<(), String> {
    vault::delete_key(app, state.inner(), id, password)
        .await
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SshState::default())
        .manage(vault::VaultState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_store::Builder::new()
                .build()
        )
        .invoke_handler(
            tauri::generate_handler![
                connect_aws_ssh,
                ssh_input,
                ssh_resize,
                ssh_disconnect,
                ssh_start_local_forward,
                ssh_stop_local_forward,
                ssh_host_key_decision,
                ssh_key_passphrase,
                sftp_list,
                sftp_download,
                sftp_upload,
                vault_import_key,
                vault_read_key,
                vault_list_keys,
                vault_delete_key,
                aws_discover_instances,
                write_connection_backup,
                read_connection_backup,
                ssh_config_entries,
            ]
        )
        .run(tauri::generate_context!())
        .expect("error while running CloudTerm");
}
