mod ssh;

use serde::Deserialize;

use ssh::client::SshState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SshConnectionRequest {
    host: String,
    port: u16,
    username: String,
    key_path: String,
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
        request.host,
        request.port,
        request.username,
        request.key_path,
        request.cols,
        request.rows,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ssh_input(
    data: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    ssh::client::send_input(
        state.inner(),
        data,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ssh_resize(
    cols: u32,
    rows: u32,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    ssh::client::resize_terminal(
        state.inner(),
        cols,
        rows,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ssh_disconnect(
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    ssh::client::disconnect(
        state.inner(),
    )
    .await
    .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SshState::default())
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
            ]
        )
        .run(tauri::generate_context!())
        .expect("error while running CloudTerm");
}