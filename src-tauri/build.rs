fn main() {
    println!("cargo:rerun-if-env-changed=THEBOYS_SOCIAL_BACKEND_URL");
    tauri_build::build();
}
