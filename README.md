# pdf_editor

Desktop-first PDF application for viewing, filling, annotating, signing, and **reliably saving** PDFs.

pdf_editor is an original product. Related open-source tools were used only as feature inspiration—not as UI or architecture clones:

- [Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF)
- [pdf.js](https://mozilla.github.io/pdf.js/)
- [OCRmyPDF](https://ocrmypdf.readthedocs.io/)
- [DocuSeal](https://www.docuseal.com/)
- [Xournal++](https://xournalpp.github.io/)
- [OpenSign](https://www.opensignlabs.com/)
- [PDF Arranger](https://github.com/pdfarranger/pdfarranger)
- [qpdf](https://qpdf.sourceforge.io/)
- [pdfme](https://pdfme.com/)
- [PDF4QT](https://jakubmelka.github.io/)

## Stack

- **TypeScript / React frontend (~80–90%)** — UI, viewer, overlays, forms, signatures
- **Tauri / Rust** — desktop shell, filesystem access, verified save
- **Vite** — bundling
- **Tailwind CSS + shadcn/ui** — theming and primitives (dark charcoal aesthetic)
- **ReUI Frame-inspired panels** — layout inspired by [ReUI Frame / card application blocks](https://reui.io/blocks/application/card) (inspiration, not a clone)
- **PDF.js** — render, scroll, thumbnails, search, text layer
- **pdf-lib** — forms, edits, export
- **React Konva** — draggable overlay editor
- **Signature Pad** — handwritten signatures

## First release focus

| Mode | Capability |
|------|------------|
| **Open** | Local PDFs, drag-and-drop, recent files |
| **View** | Smooth scroll, thumbnails, zoom, fit width/page, rotate, search, text selection, print |
| **Fill** | Existing AcroForm fields + optional Smart Fill suggestions (confirm before create) |
| **Add** | Text, image, checkmark, date, initials, highlight, draw, shapes |
| **Sign** | Draw, type, or import transparent PNG; reusable local library; initials |
| **Save / Save As** | Verified export pipeline (see below) |

Later releases: merge, split, organize, OCR, redaction, compression, conversion, passwords, comparison.

## Verified save (most important)

Clicking **Save** never reports success until verification finishes:

1. Export edits to a **temporary file beside the original** (`*.pdf_editor.tmp.pdf`)
2. Confirm the result is **non-empty** and starts with `%PDF`
3. Confirm PDF structure (including `%%EOF`)
4. **Reopen** the temp file successfully (pdf-lib / PDF.js)
5. Only then **replace** the original
6. Show a confirmation with **filename, location, size, and timestamp**

On failure: the original is preserved, a recovery copy may be written (`*.pdf_editor.recovery.pdf`), the exact error is shown, and **Save As** is offered.

Also: `Ctrl+S`, dirty indicators, autosaved recovery drafts, unsaved-change warnings.

### Visual vs digital signatures

Placing a drawn/typed/imported signature adds a **visual** signature image on the page. That is **not** a certificate-based digital signature (PKCS#7 / DocMDP). Certificate signing is out of scope for v1.

## Architecture

```
src/
  app/           Shell, toolbar, modes, shortcuts, error boundary
  viewer/        PDF.js rendering, navigation, search, thumbnails
  document/      Model, zustand store, undo/redo history
  forms/         AcroForm loader, form overlay, Smart Fill
  overlay/       Konva editor, tools, alignment guides
  signatures/    Signature engine + pad dialog
  ocr/           Optional OCR stub (disabled in v1)
  organizer/     Page organizer stub (later)
  export/        buildPdfWithEdits + verifiedSave pipeline
  persistence/   File IO, recent files, drafts, SaveIO adapters
  components/ui/ shadcn/ui primitives (button, dialog, tabs, …)
  components/    Frame panels and shared UI building blocks
```

## Develop

Requirements: Node 20+, Rust (for Tauri), [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run fixture          # sample PDF for tests
npm run dev              # web UI only
npm run tauri:dev        # full desktop app
npm test                 # unit tests
npm run test:e2e         # Playwright (open + render)
npm run typecheck
npm run build
```

## Tests

- Unit: PDF verification, save pipeline (never “saved” before verify), history, Smart Fill `confirmed: false`
- E2E: open fixture PDF and render pages
- Pipeline: export with overlays, reopen, `verifiedSave` with browser SaveIO

## License

MIT
