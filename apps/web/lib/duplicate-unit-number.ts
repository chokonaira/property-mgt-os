/**
 * Generates the next number for a duplicated row.
 *
 *   "01"           → "02"          (zero-padded, width preserved)
 *   "WHG-12"       → "WHG-13"       (any prefix, integer suffix)
 *   "TG-09"        → "TG-10"        (overflow widens naturally)
 *   "1.1"          → "1.2"          (dotted, last segment increments)
 *   "Hobbygarten"  → "Hobbygarten (copy)"  (no digit tail; suffix)
 *   ""             → ""             (empty stays empty; user fills in)
 *
 * Pure: no RHF / locale coupling so this can be unit-tested in
 * isolation. Used by the unit-table's row-Duplicate action.
 */
export function nextNumber(current: string): string {
  if (current === '') return '';
  const trimmed = current.trim();
  const match = trimmed.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) return `${trimmed} (copy)`;
  const head = match[1] ?? '';
  const digits = match[2] ?? '';
  const tail = match[3] ?? '';
  const incremented = String(Number(digits) + 1).padStart(digits.length, '0');
  return `${head}${incremented}${tail}`;
}

/**
 * Advances `nextNumber` repeatedly until the result isn't already in
 * `taken`. Used by row-Duplicate (single + bulk) so a click on the
 * Duplicate icon for "01" against existing 01, 02, 03 produces "04"
 * instead of the colliding "02" — keeping the table valid for save.
 *
 * For non-numeric seeds ("Hobbygarten" → "Hobbygarten (copy)") the
 * helper appends repeated " (copy)" suffixes until unique. That stays
 * legible at low collision counts (which is the realistic case for
 * a free-text label).
 *
 * Safety bound: hard-stops at 1000 iterations so a pathological
 * `taken` set can't pin the loop. Returns the last-tried candidate
 * even if it still collides — the caller's duplicate-detector will
 * paint the row red so the user can fix it manually, which is
 * strictly better than freezing the UI.
 */
export function findNextAvailableNumber(
  seed: string,
  taken: ReadonlySet<string> | undefined,
): string {
  let candidate = nextNumber(seed);
  if (!taken || taken.size === 0) return candidate;
  let attempts = 0;
  while (taken.has(candidate) && attempts < 1000) {
    candidate = nextNumber(candidate);
    attempts += 1;
  }
  return candidate;
}
