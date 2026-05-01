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
