import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Axe-core sweep across the public-entry routes. Asserts ZERO
 * `serious` or `critical` violations against WCAG 2.1 AA (the level
 * Buena's user base needs in practice). `moderate` and `minor` are
 * reported but don't fail the run — they're the kind of "missing
 * landmark" warnings that aren't blockers.
 *
 * Same precondition as the rest of the e2e suite: `pnpm dev` (or
 * `docker compose up`) is running, the demo property is seeded.
 *
 * Wizard steps 2 + 3 are guarded — the page redirects back to step 1
 * unless the prior steps' validity is satisfied. The priming flow is
 * brittle to lock down here so step 2 + 3 a11y are covered by manual
 * axe runs against a primed wizard rather than this gate. Component-
 * level renders for those surfaces are exercised via RTL in
 * `__tests__/wizard-mea-bar.test.tsx`, `field-chip.test.tsx`,
 * `ai-review-panel.test.tsx`.
 */

test.describe.configure({ mode: 'serial' });

const ROUTES = [
  { path: '/en', name: 'dashboard' },
  { path: '/en/properties/new', name: 'wizard step 1 (general)' },
];

for (const route of ROUTES) {
  test(`a11y: ${route.name} has no serious / critical WCAG 2.1 AA violations`, async ({ page }) => {
    await page.context().addCookies([
      { name: 'BUENA_LOCALE', value: 'en', url: 'http://localhost:3000' },
    ]);
    await page.goto(route.path);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    if (blocking.length > 0) {
      // eslint-disable-next-line no-console -- intentional: surface the failure detail in CI logs
      console.error(
        `axe violations on ${route.name}:`,
        JSON.stringify(blocking, null, 2),
      );
    }
    expect(blocking).toEqual([]);
  });
}
