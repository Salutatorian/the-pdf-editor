import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'e2e', 'fixtures', 'sample.pdf');

async function main() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText('JW PDF Sample', {
    x: 72,
    y: 720,
    size: 24,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('Name:', {
    x: 72,
    y: 660,
    size: 12,
    font,
  });

  const form = doc.getForm();
  const nameField = form.createTextField('full_name');
  nameField.setText('');
  nameField.addToPage(page, {
    x: 120,
    y: 648,
    width: 280,
    height: 22,
  });

  const pdfBytes = await doc.save();
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, pdfBytes);
  console.log(`Wrote ${outPath} (${pdfBytes.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
