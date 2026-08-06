import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, 'fixtures', 'sample.pdf');

test.describe('pdf_editor viewer', () => {
  test('loads app empty state and opens fixture PDF', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'pdf_editor' })).toBeVisible();

    // Hidden file input — set files directly
    const input = page.getByTestId('file-input');
    await input.setInputFiles(fixture);

    await expect(page.getByTestId('pdf-viewer')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('pdf-scroll')).toBeVisible();
    // At least one rendered page canvas
    await expect(page.locator('.page-canvas canvas').first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
