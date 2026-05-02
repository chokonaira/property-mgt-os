import { test, expect, type Page } from '@playwright/test';

/**
 * Happy-path E2E for the wizard. Walks dashboard → create wizard →
 * three steps with realistic data → save → confirm the property
 * lands on the dashboard + detail view.
 *
 * Preconditions:
 *   - `pnpm dev` (or `docker compose up`) is running.
 *   - Database is migrated + seeded with the demo property.
 *
 * The spec creates a UNIQUE property each run (timestamp-suffixed
 * `uniqueNumber`) so reruns don't trip the 409 unique constraint.
 * No fresh seed required between runs.
 */

const ENGLISH_BASE = '/en';

test.describe.configure({ mode: 'serial' });

test('wizard happy path: dashboard → create → 3 steps → save → see in detail view', async ({
  page,
}) => {
  const stamp = Date.now();
  const uniqueNumber = `E2E-${stamp}`;
  const propertyName = `Playwright Property ${stamp}`;

  // Force English so the spec's locator text is stable. The middleware
  // honours BUENA_LOCALE; setting it before the first navigation
  // avoids a redirect.
  await page.context().addCookies([
    { name: 'BUENA_LOCALE', value: 'en', url: 'http://localhost:3000' },
  ]);

  // 1. Dashboard
  await page.goto(`${ENGLISH_BASE}`);
  await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
  await page.getByRole('link', { name: /Create new property/i }).first().click();

  // 2. Step 1 — General info
  await expect(page).toHaveURL(/\/properties\/new$/);
  await page.getByLabel(/Property name/i).fill(propertyName);
  await page.getByLabel(/Unique number/i).fill(uniqueNumber);
  // The unique-number probe runs debounced; wait for the "Available"
  // hint before advancing so the step's validity gate passes.
  await expect(page.getByText(/Available\./i)).toBeVisible({ timeout: 10_000 });
  await fillTotalMea(page, '1000');
  await clickNext(page);

  // 3. Step 2 — Buildings
  await expect(page).toHaveURL(/\/properties\/new\/buildings$/);
  await page.getByLabel(/^Street$/i).fill('Hauptstraße');
  await page.getByLabel(/House no\./i).fill('12');
  await clickNext(page);

  // 4. Step 3 — Units (5 rows, MEA sums to 1000 to satisfy the
  // server's MEA invariant)
  await expect(page).toHaveURL(/\/properties\/new\/units$/);
  await fillUnitRow(page, 0, { number: '1.1', size: '80', rooms: '3', mea: '200' });
  await addRow(page);
  await fillUnitRow(page, 1, { number: '1.2', size: '70', rooms: '3', mea: '200' });
  await addRow(page);
  await fillUnitRow(page, 2, { number: '1.3', size: '60', rooms: '2', mea: '200' });
  await addRow(page);
  await fillUnitRow(page, 3, { number: '1.4', size: '90', rooms: '4', mea: '200' });
  await addRow(page);
  await fillUnitRow(page, 4, { number: '1.5', size: '85', rooms: '3', mea: '200' });

  // 5. Save → redirect to detail view
  await page.getByRole('button', { name: /Save property/i }).click();
  await page.waitForURL(/\/properties\/[a-z0-9]+$/, { timeout: 30_000 });

  // 6. Detail view assertions
  await expect(page.getByRole('heading', { name: propertyName })).toBeVisible();
  // Unit count summary shows "5 units" somewhere in the units section.
  await expect(page.getByText(/5\s*units/i)).toBeVisible();
  // MEA bar shows the matched-total status (the 200 × 5 = 1000 case).
  await expect(page.getByText(/Sum matches the declared total/i)).toBeVisible();

  // 7. Round-trip back to the dashboard — the new property row appears.
  await page.goto(`${ENGLISH_BASE}`);
  await expect(page.getByText(propertyName)).toBeVisible();
});

async function clickNext(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Next$/i }).click();
}

async function addRow(page: Page): Promise<void> {
  await page.getByRole('button', { name: /\+ Add unit/i }).click();
}

async function fillTotalMea(page: Page, value: string): Promise<void> {
  // Total MEA input only renders for WEG management type (default).
  const input = page.getByLabel(/Total MEA/i);
  if (await input.isVisible()) {
    await input.fill(value);
  }
}

async function fillUnitRow(
  page: Page,
  index: number,
  values: { number: string; size: string; rooms: string; mea: string },
): Promise<void> {
  // The unit-table cells expose data-cell-row + data-cell-col on the
  // inputs themselves. Lock to row index + column id to avoid label
  // collisions across rows.
  const cell = (col: string) =>
    page.locator(`[data-cell-row="${index}"][data-cell-col="${col}"]`);
  await cell('number').fill(values.number);
  await cell('sizeSqm').fill(values.size);
  await cell('rooms').fill(values.rooms);
  await cell('meaShare').fill(values.mea);
}
