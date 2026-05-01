'use client';

import { useCallback, useRef, type KeyboardEvent } from 'react';

// Cell-navigation contract: every editable element in the unit table
// carries `data-cell-row` (0-indexed row) and `data-cell-col` (column id
// string from the TanStack column def). The hook listens at the table
// container, intercepts Enter / Escape / ArrowUp / ArrowDown, and moves
// focus to the matching `[data-cell-row][data-cell-col]` element.
//
// Tab / Shift+Tab fall through to native browser focus order, which
// already cycles within a row and jumps to the next row's first cell
// when it hits the row boundary — there's no need to reimplement DOM
// tab order here.
//
// Esc behaviour: capture the input's value on focus into a per-cell ref,
// and on Esc restore that value, fire an `input` event so React /
// react-hook-form's onChange path picks it up, then blur. This gives the
// "revert pending value and exit edit mode" UX without fighting RHF's
// own `resetField` (which would revert to the default, not the pre-edit
// value).
const NAVIGABLE_INPUT_TYPES = new Set([
  'text',
  'number',
  'tel',
  'email',
  'url',
  'search',
  'password',
  '',
]);

export function isTextLikeInput(el: Element | null): el is HTMLInputElement {
  if (!el) return false;
  if (el.tagName !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return NAVIGABLE_INPUT_TYPES.has(type);
}

export type NavAction = 'commit-down' | 'down' | 'up' | 'revert';

/**
 * Pure key → navigation-intent mapping. Lives outside the hook so it can
 * be unit-tested without a DOM. Returns null for keys we don't handle
 * (notably ArrowLeft / ArrowRight / Tab / Shift+Tab — those flow through
 * to native browser behaviour) and for any key combined with a modifier
 * (so Cmd+ArrowUp / Ctrl+End / Alt+anything pass through unchanged).
 */
export function classifyNavigationKey(
  key: string,
  modifiers: { meta?: boolean; ctrl?: boolean; alt?: boolean },
): NavAction | null {
  if (modifiers.meta || modifiers.ctrl || modifiers.alt) return null;
  switch (key) {
    case 'Enter':
      return 'commit-down';
    case 'Escape':
      return 'revert';
    case 'ArrowDown':
      return 'down';
    case 'ArrowUp':
      return 'up';
    default:
      return null;
  }
}

function findCell(container: HTMLElement, row: number, col: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `[data-cell-row="${row}"][data-cell-col="${CSS.escape(col)}"]`,
  );
}

function focusCell(el: HTMLElement) {
  el.focus();
  if (el instanceof HTMLInputElement && isTextLikeInput(el)) {
    // Jump caret to the end so a follow-up Enter immediately commits.
    requestAnimationFrame(() => {
      try {
        el.setSelectionRange(el.value.length, el.value.length);
      } catch {
        // Some input types (e.g. number) throw on setSelectionRange in
        // certain browsers — best-effort, ignore.
      }
    });
  }
}

export function useCellNavigation() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Capture each input's value on focus, indexed by the focused element.
  // A WeakMap keeps memory bounded — when a row is removed and its inputs
  // are GC'd, the captured values go with them.
  const capturedValues = useRef(new WeakMap<HTMLInputElement, string>());

  const onFocus = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && isTextLikeInput(target)) {
      capturedValues.current.set(target, target.value);
    }
  }, []);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const row = Number(target.dataset.cellRow);
    const col = target.dataset.cellCol;
    if (Number.isNaN(row) || !col) return;

    const action = classifyNavigationKey(event.key, {
      meta: event.metaKey,
      ctrl: event.ctrlKey,
      alt: event.altKey,
    });
    if (!action) return;

    // ArrowUp / ArrowDown on a native <select> would change selection —
    // let the browser handle that.
    if ((action === 'up' || action === 'down') && target.tagName === 'SELECT') return;

    if (action === 'revert') {
      if (target instanceof HTMLInputElement && isTextLikeInput(target)) {
        const original = capturedValues.current.get(target);
        if (original !== undefined && original !== target.value) {
          // Use the React-aware setter so RHF's onChange fires and the
          // form state matches the visible value.
          const proto = Object.getPrototypeOf(target) as HTMLInputElement;
          const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
          descriptor?.set?.call(target, original);
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      target.blur();
      event.preventDefault();
      return;
    }

    const nextRow = action === 'up' ? row - 1 : row + 1;
    const next = findCell(container, nextRow, col);
    event.preventDefault();
    if (next) focusCell(next);
    else if (action === 'commit-down') target.blur();
  }, []);

  return { containerRef, onKeyDown, onFocus };
}
