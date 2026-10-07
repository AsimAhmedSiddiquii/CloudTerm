fn main() {
  println!("cargo:rerun-if-env-changed=CLOUDTERM_UPDATER_PUBLIC_KEY");
  tauri_build::build()
}
