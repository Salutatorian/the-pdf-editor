/**
 * Builds a screenshot-friendly demo PDF for README / marketing shots.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoOut = join(__dirname, '..', 'docs', 'demo-form.pdf');
const desktopOut = join(homedir(), 'Desktop', 'pdf_editor-demo.pdf');

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();

  // Header band
  page.drawRectangle({
    x: 0,
    y: 730,
    width: 612,
    height: 62,
    color: rgb(0.12, 0.14, 0.18),
  });
  page.drawText('pdf_editor', {
    x: 48,
    y: 754,
    size: 22,
    font: bold,
    color: rgb(0.95, 0.96, 0.98),
  });
  page.drawText('Demo intake form  ·  for README screenshots', {
    x: 48,
    y: 738,
    size: 10,
    font,
    color: rgb(0.65, 0.7, 0.78),
  });

  page.drawText('Applicant details', {
    x: 48,
    y: 690,
    size: 14,
    font: bold,
    color: rgb(0.15, 0.17, 0.22),
  });

  const label = (text, x, y) =>
    page.drawText(text, {
      x,
      y,
      size: 11,
      font,
      color: rgb(0.25, 0.28, 0.35),
    });

  label('Full name', 48, 658);
  const name = form.createTextField('full_name');
  name.addToPage(page, { x: 48, y: 628, width: 250, height: 24 });

  label('Email', 320, 658);
  const email = form.createTextField('email');
  email.addToPage(page, { x: 320, y: 628, width: 244, height: 24 });

  label('Company', 48, 598);
  const company = form.createTextField('company');
  company.addToPage(page, { x: 48, y: 568, width: 250, height: 24 });

  label('Phone', 320, 598);
  const phone = form.createTextField('phone');
  phone.addToPage(page, { x: 320, y: 568, width: 244, height: 24 });

  label('Date', 48, 538);
  const date = form.createTextField('date');
  date.addToPage(page, { x: 48, y: 508, width: 140, height: 24 });

  page.drawText('Shipping preference', {
    x: 48,
    y: 470,
    size: 14,
    font: bold,
    color: rgb(0.15, 0.17, 0.22),
  });

  const mkCheck = (name, x, y, caption) => {
    const cb = form.createCheckBox(name);
    cb.addToPage(page, { x, y, width: 14, height: 14 });
    page.drawText(caption, {
      x: x + 22,
      y: y + 1,
      size: 11,
      font,
      color: rgb(0.25, 0.28, 0.35),
    });
  };
  mkCheck('pref_ocean', 48, 440, 'Ocean');
  mkCheck('pref_air', 140, 440, 'Air');
  mkCheck('pref_ground', 220, 440, 'Ground');
  mkCheck('pref_express', 320, 440, 'Express');

  label('Notes / special instructions', 48, 400);
  const notes = form.createTextField('notes');
  notes.enableMultiline();
  notes.addToPage(page, { x: 48, y: 300, width: 516, height: 90 });

  // Signature block
  page.drawRectangle({
    x: 48,
    y: 120,
    width: 516,
    height: 140,
    borderColor: rgb(0.82, 0.85, 0.9),
    borderWidth: 1,
    color: rgb(0.98, 0.98, 0.99),
  });
  page.drawText('Authorization', {
    x: 64,
    y: 232,
    size: 12,
    font: bold,
    color: rgb(0.15, 0.17, 0.22),
  });
  page.drawText(
    'I confirm the information above is accurate.',
    {
      x: 64,
      y: 212,
      size: 10,
      font,
      color: rgb(0.4, 0.44, 0.5),
    },
  );

  label('Signature', 64, 180);
  page.drawLine({
    start: { x: 64, y: 150 },
    end: { x: 280, y: 150 },
    thickness: 1,
    color: rgb(0.7, 0.74, 0.8),
  });
  const sig = form.createTextField('signature');
  sig.addToPage(page, { x: 64, y: 152, width: 216, height: 28 });

  label('Date signed', 320, 180);
  page.drawLine({
    start: { x: 320, y: 150 },
    end: { x: 520, y: 150 },
    thickness: 1,
    color: rgb(0.7, 0.74, 0.8),
  });
  const signed = form.createTextField('date_signed');
  signed.addToPage(page, { x: 320, y: 152, width: 200, height: 28 });

  page.drawText('pdf_editor demo  ·  open this file to capture README screenshots', {
    x: 48,
    y: 48,
    size: 9,
    font,
    color: rgb(0.55, 0.58, 0.64),
  });

  // Light second page for organize / multi-page shots
  const page2 = doc.addPage([612, 792]);
  page2.drawText('Page 2  ·  Attachment summary', {
    x: 48,
    y: 720,
    size: 16,
    font: bold,
    color: rgb(0.15, 0.17, 0.22),
  });
  page2.drawText(
    'Use Organize mode to reorder, rotate, or extract this page.',
    {
      x: 48,
      y: 690,
      size: 11,
      font,
      color: rgb(0.35, 0.38, 0.45),
    },
  );
  for (let i = 0; i < 6; i++) {
    page2.drawRectangle({
      x: 48,
      y: 600 - i * 48,
      width: 516,
      height: 36,
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });
    page2.drawText(`Attachment item ${i + 1}`, {
      x: 64,
      y: 612 - i * 48,
      size: 11,
      font,
      color: rgb(0.3, 0.33, 0.4),
    });
  }

  const bytes = await doc.save();
  await mkdir(dirname(repoOut), { recursive: true });
  await writeFile(repoOut, bytes);
  try {
    await copyFile(repoOut, desktopOut);
    console.log(`Desktop: ${desktopOut}`);
  } catch (err) {
    console.warn('Could not copy to Desktop:', err instanceof Error ? err.message : err);
  }
  console.log(`Repo:    ${repoOut} (${bytes.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
