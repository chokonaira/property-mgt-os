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
- **Generate N units.** Modal with type + building + count + start + prefix override. Default prefixes match the sample doc: `''` for APARTMENT, `O-` OFFICE, `TG-` PARKING (Tiefgarage), `G-` GARDEN. Single source of truth via `formatGeneratedNumber()`.
- **Duplicate row.** Copy fields except `number`; `nextNumber()` increments the trailing integer with pad preserved (`TG-09 → TG-10`).
- **Multi-select bulk delete.** Sticky-top action bar appears when any row is selected. Selection keys on RHF's stable field-array id, not row index (which shifts on remove). Reverse-walk delete preserves index validity.

**Live MEA invariant bar.** Sticky bottom of the units step, WEG-only. Three tones — green matched (0.01 tol), amber short, red exceeded. Click toggles per-building breakdown. Pure `computeMeaBreakdown()` + `classifyMeaTone()` helpers; the same tolerance the server's `ensureMeaWarning` uses.

**Performance.** Native render up to 50 rows; **TanStack Virtual** engages past the threshold with sticky thead, padding `<tr>` spacers, and ~20 rows in DOM regardless of total row count. Selection state lives in a `SelectionContext` so toggling a checkbox doesn't rebuild the columns array.

## Consequences

**Positive.** 60-unit paste from Excel → parsed → rendered in milliseconds. Parking-block "5 spots in a row" → one click. The MEA bar gives the user a real-time invariant check; the server's MEA_MISMATCH warning agrees with it because both use the same 0.01 tolerance.

**Negative.** Per-cell chip + Source link adds ~14 px to row height; that's why the virtualizer's `estimateSize` is 70, not the bare 56 px of the input. Initial scroll on a 200-row paste is briefly jumpy as estimates resolve.

**Neutral.** No Excel `.xlsx` upload — paste-from-clipboard covers the realistic flow. Direct file upload is queued for v1.1 if reviewers ask for it.
