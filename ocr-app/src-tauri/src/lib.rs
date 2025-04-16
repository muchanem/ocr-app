use pyo3::prelude::*;
use serde::Serialize;
use std::ffi::CString; // Keep CString
use tauri::{ipc::Channel, AppHandle}; // Keep AppHandle
use tokio::task; // Keep tokio::task

const OCR_PY_SOURCE: &str = include_str!("../src_python/ocr.py");

/// Custom event to send back to the frontend via Channel.
/// Now holds an owned String for the path.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
enum OCREvent {
    // Removed lifetime parameter 'a
    #[serde(rename_all = "camelCase")]
    Success { path: String, ocr_text: String },
    #[serde(rename_all = "camelCase")]
    Error { path: String, message: String }, // Use owned String for path
}

#[tauri::command]
async fn process_files(paths: Vec<String>, on_event: Channel<OCREvent>) {
    println!("Rust received paths: {:?}", paths);

    for path in paths {
        let path_clone = path.clone();
        // --- FIX: Clone the channel handle HERE to get an owned instance ---
        // This owned channel can then be moved into the spawned task.
        let channel_clone = on_event.clone();

        // Spawn a task for each path
        task::spawn(async move {
            // Call Python
            let result = Python::with_gil(|py| -> PyResult<String> {
                let code_cstr = CString::new(OCR_PY_SOURCE).map_err(|e| {
                    PyErr::new::<pyo3::exceptions::PyValueError, _>(format!(
                        "Invalid source code: {}",
                        e
                    ))
                })?;
                let filename_cstr = CString::new("ocr.py").unwrap(); // Safe unwrap for literals
                let modulename_cstr = CString::new("ocr").unwrap(); // Safe unwrap for literals

                // Load the Python code as a module using references to CStrings
                let ocr_module =
                    PyModule::from_code(py, &code_cstr, &filename_cstr, &modulename_cstr)?;

                // Grab the function you need
                let func = ocr_module.getattr("transcribe_file")?;
                // Invoke with `path_clone` as the argument
                let py_result = func.call1((path_clone.as_str(),))?; // Borrow path_clone temporarily
                                                                     // Extract the string result
                py_result.extract()
            });

            // Build the event based on success or error
            // --- FIX: Use the moved owned path_clone for the event data ---
            let event = match result {
                Ok(ocr_text) => {
                    println!(
                        "Success for {} => (text length: {})",
                        path_clone, // Log the owned path
                        ocr_text.len()
                    );
                    OCREvent::Success {
                        path: path_clone, // Move ownership of the path into the event
                        ocr_text,
                    }
                }
                Err(err) => {
                    let msg = format!("Python error for {} => {}", path_clone, err); // Log the owned path
                    eprintln!("{}", msg);
                    OCREvent::Error {
                        path: path_clone, // Move ownership of the path into the event
                        message: msg,
                    }
                }
            };

            // --- FIX: Use the cloned channel moved into this task ---
            if let Err(e) = channel_clone.send(event) {
                // Cannot use path_clone here as it was moved into the event
                eprintln!("Failed to send event: {}", e);
            }
        }); // End of spawned task
    } // End of loop

    println!("Spawned tasks for all files.");
} // End of process_files

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![process_files, write_file]) // Ensure greet is removed if not used
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
