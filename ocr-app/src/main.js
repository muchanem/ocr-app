// Tauri APIs
const { invoke, Channel } = window.__TAURI__.core;
const { getCurrentWebview } = window.__TAURI__.webview;
const { writeText } = window.__TAURI__.clipboardManager;
// DOM elements
const initialView = document.getElementById("initial-view");
const fileListView = document.getElementById("file-list-view");
const fileList = document.getElementById("file-list");

// State
const addedFilePaths = new Set();
let ocrChannel = null;

// --- Helpers ---
const getFilename = (fullPath) => {
    if (!fullPath) return "";
    const idx = Math.max(fullPath.lastIndexOf("/"), fullPath.lastIndexOf("\\"));
    return idx === -1 ? fullPath : fullPath.substring(idx + 1);
};

const showFileListView = () => {
    initialView.classList.add("hidden");
    fileListView.classList.remove("hidden");
};

const showInitialView = () => {
    fileListView.classList.add("hidden");
    initialView.classList.remove("hidden");
    fileList.innerHTML = "";
    addedFilePaths.clear();
    ocrChannel = null;
};

// Creates a pill in the UI for a file
const createFilePill = (filePath) => {
    const li = document.createElement("li");
    li.className = "file-pill status-processing";
    li.dataset.filepath = filePath;

    const content = document.createElement("div");
    content.className = "pill-content";

    const nameSpan = document.createElement("span");
    nameSpan.className = "filename";
    nameSpan.textContent = getFilename(filePath);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "pill-actions";

    // Example icons (disabled by default)
    const downloadIcon = document.createElement("span");
    downloadIcon.className = "material-symbols-outlined download-icon";
    downloadIcon.textContent = "file_download_off";

    const copyIcon = document.createElement("span");
    copyIcon.className = "material-symbols-outlined copy-icon";
    copyIcon.textContent = "file_copy_off";

    actionsDiv.append(downloadIcon, copyIcon);
    content.append(nameSpan, actionsDiv);
    li.append(content);

    return li;
};

// Append new file paths to the UI
const appendFilesToUI = (paths) => {
    let newAdded = false;
    paths.forEach((filePath) => {
        if (addedFilePaths.has(filePath)) return;

        const pill = createFilePill(filePath);
        fileList.appendChild(pill);
        addedFilePaths.add(filePath);
        newAdded = true;
    });

    if (newAdded) {
        requestAnimationFrame(() => {
            fileListView.scrollTop = fileListView.scrollHeight;
        });
    }
};

// Main logic for calling the backend
const processFilesWithBackend = async (paths) => {
    if (!paths || !paths.length) return;

    if (!ocrChannel) {
        // Only create one channel for the lifetime of the page
        ocrChannel = new Channel();
        ocrChannel.onmessage = ({ event, data }) => {
            console.log("Received event:", event, data);
            const { path } = data;
            const pill = document.querySelector(`[data-filepath="${path}"]`);
            if (!pill) return;

            pill.classList.remove("status-processing");
            const downloadIcon = pill.querySelector(".download-icon");
            const copyIcon = pill.querySelector(".copy-icon");

            if (event === "success") {
                pill.classList.add("status-complete");
                pill.dataset.ocrResult = data.ocrText;

                // Enable "download" icon
                downloadIcon.textContent = "file_download";
                downloadIcon.classList.add("action-enabled");
                downloadIcon.title = "Download OCR";
                downloadIcon.onclick = () => {
                    const md_path = data.path.replace(/\.[^.]+$/, ".md");
                    invoke("write_file", {
                        path: md_path,
                        content: data.ocrText,
                    })
                        .then(() => {
                            downloadIcon.classList.remove("action-enabled");
                            downloadIcon.classList.add("action-success");
                        })
                        .catch((err) => {
                            console.error("Download failed:", err);
                            downloadIcon.classList.remove("action-enabled");
                            downloadIcon.classList.add("action-failed");
                        });
                };

                // Enable "copy" icon
                copyIcon.textContent = "content_copy";
                copyIcon.classList.add("action-enabled");
                copyIcon.title = "Copy OCR";
                copyIcon.onclick = () => {
                    writeText(data.ocrText)
                        .then(() => {
                            alert("Copied!");
                            copyIcon.classList.remove("action-enabled");
                            copyIcon.classList.add("action-success");
                        })
                        .catch((err) => {
                            console.error("Copy failed:", err);
                            copyIcon.classList.remove("action-enabled");
                            copyIcon.classList.add("action-failed");
                        });
                };
            } else if (event === "error") {
                pill.classList.add("status-error");
                pill.title = data.message;
                downloadIcon.title = "Error";
                copyIcon.title = "Error";
            }
        };
    }

    try {
        console.log("Invoking process_files...");
        await invoke("process_files", { paths, onEvent: ocrChannel });
    } catch (err) {
        console.error("Error invoking process_files:", err);
        paths.forEach((path) => {
            const pill = document.querySelector(`[data-filepath="${path}"]`);
            if (pill) {
                pill.classList.remove("status-processing");
                pill.classList.add("status-error");
                pill.title = `Invocation error: ${err}`;
            }
        });
    }
};

// --- Drag-and-Drop for the current webview ---
const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "drop") {
        const filePaths = event.payload.paths || [];
        const newPaths = filePaths.filter((p) => !addedFilePaths.has(p));

        if (!newPaths.length) return;

        if (initialView.classList.contains("hidden")) {
            // Already in file list view
            appendFilesToUI(newPaths);
            processFilesWithBackend(newPaths);
        } else {
            // Transition from initial to file list
            if (document.startViewTransition) {
                document
                    .startViewTransition(() => {
                        showFileListView();
                        appendFilesToUI(newPaths);
                    })
                    .finished.then(() => {
                        processFilesWithBackend(newPaths);
                    });
            } else {
                showFileListView();
                appendFilesToUI(newPaths);
                processFilesWithBackend(newPaths);
            }
        }
    }
});

// --- "Start Over" button ---
const returnButton = document.createElement("button");
returnButton.id = "return-button";
returnButton.textContent = "Start Over";
returnButton.onclick = () => {
    if (document.startViewTransition) {
        document.startViewTransition(showInitialView);
    } else {
        showInitialView();
    }
};
fileListView.appendChild(returnButton);

console.log("Main script loaded!");
