mod ssh;
mod vault;

use serde::Deserialize;

use ssh::client::SshState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SshConnectionRequest {
    session_id: String,
    host: String,
    port: u16,
    username: String,
    key_contents: String,
    cols: u32,
    rows: u32,
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
        request.cols,
        request.rows,
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
async fn ssh_host_key_decision(
    session_id: String,
    accepted: bool,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    ssh::client::host_key_decision(state.inner(), session_id, accepted)
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
                ssh_host_key_decision,
                vault_import_key,
                vault_read_key,
            ]
        )
        .run(tauri::generate_context!())
        .expect("error while running CloudTerm");
}
