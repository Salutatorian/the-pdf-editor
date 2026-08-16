use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_fs::FsExt;

/// PDF paths received via Open With / double-click before the UI is ready.
struct PendingFiles(Mutex<Vec<String>>);

#[tauri::command]
fn take_opened_files(state: tauri::State<'_, PendingFiles>) -> Vec<String> {
  state.0.lock().map(|mut g| std::mem::take(&mut *g)).unwrap_or_default()
}

fn is_pdf_path(path: &std::path::Path) -> bool {
  path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.eq_ignore_ascii_case("pdf"))
    .unwrap_or(false)
}

/// Turn a CLI / Opened arg into a PDF path. Skips flags and non-file URLs.
fn arg_to_pdf_path(arg: &str) -> Option<PathBuf> {
  let trimmed = arg.trim().trim_matches('"');
  if trimmed.is_empty() || trimmed.starts_with('-') {
    return None;
  }

  let path = if let Ok(url) = url::Url::parse(trimmed) {
    if url.scheme() == "file" {
      url.to_file_path().ok()?
    } else {
      return None;
    }
  } else {
    PathBuf::from(trimmed)
  };

  if is_pdf_path(&path) {
    Some(path)
  } else {
    None
  }
}

fn pdf_paths_from_args(args: &[String]) -> Vec<PathBuf> {
  // args[0] is the executable — skip it
  args.iter().skip(1).filter_map(|a| arg_to_pdf_path(a)).collect()
}

fn allow_fs_for_files(app: &AppHandle, files: &[PathBuf]) {
  let scope = app.fs_scope();
  for file in files {
    let _ = scope.allow_file(file);
  }
}

fn deliver_pdf_paths(app: &AppHandle, files: Vec<PathBuf>) {
  if files.is_empty() {
    return;
  }
  allow_fs_for_files(app, &files);
  let paths: Vec<String> = files
    .into_iter()
    .map(|p| p.to_string_lossy().into_owned())
    .collect();

  if let Ok(mut pending) = app.state::<PendingFiles>().0.lock() {
    for p in &paths {
      if !pending.iter().any(|x| x == p) {
        pending.push(p.clone());
      }
    }
  }

  let _ = app.emit("open-files", &paths);
}

fn focus_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  // Must be first so a second "Open with" focuses this instance instead of spawning another.
  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
      focus_main_window(app);
      let files = pdf_paths_from_args(&args);
      deliver_pdf_paths(app, files);
    }));
  }

  builder
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_autostart::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(PendingFiles(Mutex::new(Vec::new())))
    .invoke_handler(tauri::generate_handler![take_opened_files])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Windows / Linux: OS passes the file path as a CLI argument on Open With.
      #[cfg(any(windows, target_os = "linux"))]
      {
        let args: Vec<String> = std::env::args().collect();
        let files = pdf_paths_from_args(&args);
        deliver_pdf_paths(app.handle(), files);
      }

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while running tauri application")
    .run(|app, event| {
      // macOS: Finder Open With / double-click delivers RunEvent::Opened
      #[cfg(any(target_os = "macos", target_os = "ios"))]
      if let tauri::RunEvent::Opened { urls } = event {
        let files: Vec<PathBuf> = urls
          .into_iter()
          .filter_map(|u| u.to_file_path().ok())
          .filter(|p| is_pdf_path(p))
          .collect();
        deliver_pdf_paths(app, files);
      }

      #[cfg(not(any(target_os = "macos", target_os = "ios")))]
      {
        let _ = (app, event);
      }
    });
}
