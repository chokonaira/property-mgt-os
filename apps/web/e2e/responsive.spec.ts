import { test, expect } from '@playwright/test';

/**
 * Catches horizontal-overflow regressions across the breakpoints that
 * matter: iPhone SE (375 — the narrowest target the brief assumes),
 * iPhone 14 / Pixel 7 (414), iPad portrait (768), and desktop (1280).
 *
 * The assertion is "no surprise scrollbar" — `documentElement.scrollWidth`
 * must not exceed the viewport width by more than 1px (sub-pixel
 * rounding tolerance). Catches the class of bug where a fixed-width
 * table or non-wrapping headline pushes the page wider than the
 * viewport on a small device.
 *
 * Wizard steps 2 + 3 are gated behind step 1's validity, so they're
 * covered by RTL component tests + the loom walkthrough rather than
 * primed end-to-end here. Same precondition as the rest of the e2e
 * suite: `pnpm dev` (or `docker compose up`) is already running.
 */

const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'iphone-14', width: 414, height: 896 },
  { name: 'ipad-portrait', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

const ROUTES = [
  { path: '/en', name: 'dashboard' },
  { path: '/en/properties/new', name: 'wizard step 1' },
] as const;

test.describe.configure({ mode: 'serial' });

for (const viewport of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`responsive: ${route.name} fits ${viewport.name} (${viewport.width}px) without horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.context().addCookies([
        { name: 'BUENA_LOCALE', value: 'en', url: 'http://localhost:3000' },
      ]);
      await page.goto(route.path);
      // Wait for hydration so any client-rendered chrome (locale switcher,
      // theme toggle) is included in the layout measurement.
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(() => {
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          innerWidth: window.innerWidth,
        };
      });

      // Allow 1px sub-pixel rounding (browsers can report 375.5 → 376).
      expect(
        overflow.scrollWidth,
        `Page overflows viewport: scrollWidth=${overflow.scrollWidth} > innerWidth=${overflow.innerWidth} on ${route.name} @ ${viewport.name}`,
      ).toBeLessThanOrEqual(overflow.innerWidth + 1);
    });
  }
}
