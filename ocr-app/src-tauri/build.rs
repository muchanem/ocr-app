fn main() {
    pyo3_build_config::add_extension_module_link_args();
    if cfg!(unix) {
        if let Some(lib_dir) = &pyo3_build_config::get().lib_dir {
            println!("cargo:rustc-link-arg=-Wl,-rpath,{}", lib_dir);
        }
    }
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["process_files", "write_file"]),
        ),
    )
    .unwrap();
}
