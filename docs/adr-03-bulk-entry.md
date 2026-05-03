# ADR-03 · Bulk Entry

**Status:** Accepted · 2026-05-01

## Context

The brief explicitly calls out "60+ units quickly and efficiently." A naïve 3-step wizard with one form-card-per-unit reads polite at 5 units and breaks at 60: scroll fatigue, no keyboard nav, no copy-paste, MEA invariant invisible until save. The realistic shape of the data is **a spreadsheet** — owners paste from Excel, generate parking blocks as ranges, fix one cell, validate the total.

Constraints:

- Inline editing on every cell — no per-row modal.
- Keyboard navigation: Tab / Shift+Tab natively, Enter commits + drops to the next row, Escape reverts the cell.
- Discriminated unit types (Apartment / Office / Parking / Garden) drive metric + which fields are required.
- Live MEA total, sticky and visible while editing.
- Must scale to 200+ rows without jank.

## Decision

**Headless TanStack Table** for the engine, custom rendering. Twelve columns: `#`, Type, Building, Floor, Entrance, Size, Metric, Rooms, MEA, Year, Description, actions.

**Inline editing on every cell.** Each cell is a real `<input>` / `<select>` registered with React Hook Form via `register()`. No "edit mode" — clicking enters the cell directly. Per-cell `aria-invalid` + tooltip on validation errors via `formState.errors`.

**Keyboard navigation.** `useCellNavigation` hook on the table container:

- `Tab` / `Shift+Tab` — native DOM order.
- `Enter` — commit + jump to the same column on the next row.
- `Escape` — revert via a React-aware property setter (so RHF's onChange path picks up the revert), then blur. Snapshot taken on focus.
- `ArrowUp` / `ArrowDown` — jump rows on text/number inputs (selects keep their own up/down semantics).
- Modifier+key (Cmd / Ctrl / Alt) flows through to the browser.

**Bulk operations:**

- **Paste TSV / CSV.** Container-level `onPaste`. Pure `parsePastedRows()` auto-detects delimiter, skips header rows when every cell maps to a known column, accepts case-insensitive type values, parses German + English number formats. Bulk-paste signal is unambiguous (multi-line OR tab) — single-line content with a comma falls through to native paste so German numbers like "1.234,56" don't get mangled.
- **Generate N units.** Modal with type + building + count + start + prefix override. Default prefixes match the sample doc: `''` for APARTMENT, `O-` OFFICE, `TG-` PARKING (Tiefgarage), `G-` GARDEN. Single source of truth via `formatGeneratedNumber()`. `Start at` auto-seeds to `nextSequenceForPrefix(existing) + 1` per (building × prefix) so the dialog's preview text always matches the rows that actually land. Generate is hard-blocked when the requested `[start, start+count)` range overlaps existing numbers — a senior-engineer guardrail against the previous "skip-and-advance silently shifted my range" surprise.
- **Import units from PDF.** Reuses the step-1 extraction pipeline but filters the response to units only — property + buildings on the wizard are never overwritten by a units-import action. `buildImportPlan()` matches incoming units to wizard buildings (label → nickname → address; single-building fallback only when label is genuinely missing). Preview footer reports incoming · matched · new · conflicts (with sample numbers) before the user picks **Replace All** (destructive), **Merge** (keep existing on conflict, default safe), or **Discard**.
- **Duplicate row + bulk-duplicate.** Copy fields except `number`; `findNextAvailableNumber()` advances `nextNumber()` past every taken number in the same building so a click can never produce a row that immediately collides. Bulk-duplicate seeds + grows the taken-set as it mints copies, so duplicating five rows that all read "01" yields "02" … "06".
- **Multi-select bulk delete.** Sticky-top action bar appears when any row is selected. Selection keys on RHF's stable field-array id, not row index (which shifts on remove). Reverse-walk delete preserves index validity.

**Live MEA invariant bar.** Sticky bottom of the units step, WEG-only. Three tones — green matched (0.01 tol), amber short, red exceeded. Click toggles per-building breakdown. Pure `computeMeaBreakdown()` + `classifyMeaTone()` helpers; the same tolerance the server's `ensureMeaWarning` uses.

**Validation summary banner.** Top of the units step. Aggregates schema errors (missing #, size, MEA, rooms, …) with the cross-row duplicate-number invariant into a single click-to-jump list — clicking a row label scrolls + focuses the offending `#` cell. Schema entries gated on `errorsVisible` (flips after the first failed Save) so a freshly opened blank table doesn't shout; duplicates surface immediately. A `useEffect` re-triggers `trigger('units')` on every keystroke once errors are visible so the banner stays in lock-step with what the user fixes.

**Performance.** Native render up to 50 rows; **TanStack Virtual** engages past the threshold with sticky thead, padding `<tr>` spacers, and ~20 rows in DOM regardless of total row count. Selection state lives in a `SelectionContext` so toggling a checkbox doesn't rebuild the columns array.

## Consequences

**Positive.** 60-unit paste from Excel → parsed → rendered in milliseconds. Parking-block "5 spots in a row" → one click. The MEA bar gives the user a real-time invariant check; the server's MEA_MISMATCH warning agrees with it because both use the same 0.01 tolerance.

**Negative.** Per-cell chip + Source link adds ~14 px to row height; that's why the virtualizer's `estimateSize` is 70, not the bare 56 px of the input. Initial scroll on a 200-row paste is briefly jumpy as estimates resolve.

**Neutral.** No Excel `.xlsx` upload — paste-from-clipboard + the new PDF-import path (which reuses the AI extraction pipeline) cover the realistic flows. A deterministic `.xlsx` parser is a v1.1 cut if a tenant brings clean spreadsheets where the AI hop adds no value.
