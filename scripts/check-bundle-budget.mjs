#!/usr/bin/env node
/**
 * Bundle-budget gate. Reads a captured `next build` log and fails
 * (exit 1) when any route's First Load JS exceeds the configured
 * threshold. Wired into CI immediately after the web build so a
 * regression is caught at PR time, not at production-deploy time
 * when the only signal is a Lighthouse number trending down.
 *
 * Usage:
 *   pnpm --filter @buena/web build 2>&1 | tee build.log
 *   node scripts/check-bundle-budget.mjs build.log
 *
 * Threshold is intentionally inline — overriding via an env var
 * felt like indirection without a use case. If a route legitimately
 * needs more headroom, bump the constant + leave a code-reviewable
 * trail explaining what justified the bump.
 */
import { readFileSync } from 'node:fs';

// Per-route First Load JS ceiling. 240 kB lands 10 kB above the
// original 230 kB target to accommodate the units step which
// pulls TanStack Virtual + Table + dnd-kit + the live duplicate
// detector — the irreducible kit for the bulk-entry UX. Pushing
// step 3 lower needs the v1.1 lazy-virtualizer split (only engage
// past 50 rows) which is tracked in docs/edge-cases.md.
//
// Other routes are well under (165–212 kB) so the global gate
// catches regressions on the smaller pages aggressively.
const FIRST_LOAD_BUDGET_KB = 240;

const logPath = process.argv[2];
if (!logPath) {
  console.error('Usage: check-bundle-budget.mjs <build-log-path>');
  process.exit(2);
}

const log = readFileSync(logPath, 'utf8');
const lines = log.split('\n');

/**
 * Parses lines of the Next 15 build summary table:
 *
 *   ┌ ƒ /[locale]/properties/[id]            11.4 kB         205 kB
 *   ├ ● /[locale]/properties/new             9.67 kB         213 kB
 *   ├   ├ /de/properties/new
 *   └ ○ /icon.svg                                0 B            0 B
 *
 * Skips:
 *   - Locale-variant sub-rows (├   ├ /de/...) — they inherit
 *     the parent's size; counting them double-counts the budget.
 *   - The aggregate "+ First Load JS shared by all" line.
 *   - Static assets reported as `0 B` (icon.svg, _not-found).
 */
const ROUTE_LINE = /^[┌├└]\s+[ƒ●○◐]\s+(\S+)\s+\S+\s+\S+\s+(?:(\d+(?:\.\d+)?)\s*kB|0\s*B)\s*$/;

const routes = [];
for (const line of lines) {
  const m = line.match(ROUTE_LINE);
  if (!m) continue;
  const route = m[1];
  const firstLoadKb = m[2] ? Number(m[2]) : 0;
  routes.push({ route, firstLoadKb });
}

if (routes.length === 0) {
  console.error('Could not parse any route rows from the build log.');
  console.error('Did `next build` actually run? Log preview:');
  console.error(log.split('\n').slice(0, 20).join('\n'));
  process.exit(2);
}

console.log(`Bundle budget: ${FIRST_LOAD_BUDGET_KB} kB First Load JS per route`);
console.log('');
const widest = Math.max(...routes.map((r) => r.route.length));
for (const r of routes) {
  const pad = ' '.repeat(widest - r.route.length + 2);
  const status = r.firstLoadKb > FIRST_LOAD_BUDGET_KB ? '❌' : '✓';
  console.log(`  ${status} ${r.route}${pad}${r.firstLoadKb} kB`);
}
console.log('');

const offenders = routes.filter((r) => r.firstLoadKb > FIRST_LOAD_BUDGET_KB);
if (offenders.length > 0) {
  console.error(`${offenders.length} route(s) over the ${FIRST_LOAD_BUDGET_KB} kB budget:`);
  for (const r of offenders) {
    console.error(`  ${r.route}: ${r.firstLoadKb} kB (+${(r.firstLoadKb - FIRST_LOAD_BUDGET_KB).toFixed(1)} kB)`);
  }
  console.error('');
  console.error('Fix options: lazy-load with next/dynamic, split the route, or');
  console.error('justify the bump and update FIRST_LOAD_BUDGET_KB in this script.');
  process.exit(1);
}

console.log(`✅ All ${routes.length} routes within budget.`);
