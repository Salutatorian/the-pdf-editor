# pdf_editor roadmap

## v0.1 — Current (reliability first)

- [x] Open local PDFs (dialog, drag-drop, recent)
- [x] View: scroll, thumbnails, zoom, fit width/page, rotate, search, text layer, print
- [x] Fill: AcroForm fields + Tab navigation + Smart Fill (confirm required)
- [x] Add Text: text, image, checkmark, date, initials, highlight, draw, shapes
- [x] Sign: draw / type / import PNG, cleanup, library, initials
- [x] Overlay edit: select, move, resize, rotate, duplicate, delete, guides, undo/redo, shortcuts
- [x] Verified Save / Save As (temp → verify → reopen → replace)
- [x] Dirty state, Ctrl+S, drafts, recovery copies, save confirmation

## Later

- [x] Merge / split / page organize
- [x] Optional OCR + deskew for scans
- [x] Redaction
- [x] Compression / conversion
- [x] Password protect / unlock
- [x] Document comparison
- [ ] Certificate-based digital signatures (distinct from visual signatures)

### Notes

- **Password protect:** pdf-lib 1.17.x has no `encrypt()` API — Protect shows a clear error; Unlock best-effort strips encryption via `ignoreEncryption` + re-save.
- **Compression:** object-stream re-save only; no image recompression.
- **Redaction:** opaque black overlay rectangles (content may still exist in the PDF stream underneath).
- **OCR:** tesseract.js optional pack; produces Smart Fill suggestions only — never mutates the PDF silently.
