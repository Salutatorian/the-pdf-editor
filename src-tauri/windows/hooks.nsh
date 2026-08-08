; Wipe all app data (signatures, settings, caches) on uninstall.
; Tauri stores webview localStorage/IndexedDB and app config under the
; per-user AppData dirs for this app. Removing them here means a full
; "Programs and Features" uninstall leaves nothing behind.

!macro NSIS_HOOK_POSTUNINSTALL
  ; Tauri app data dirs (com.pdfeditor.desktop)
  RMDir /r "$APPDATA\com.pdfeditor.desktop"
  RMDir /r "$LOCALAPPDATA\com.pdfeditor.desktop"
  ; WebView2 user data folder (sometimes named after productName)
  RMDir /r "$LOCALAPPDATA\pdf_editor"
  RMDir /r "$APPDATA\pdf_editor"
!macroend
