import { describe, expect, it } from 'vitest';
import { classifyNavigationKey } from '@/components/unit-table/use-cell-navigation';

const noMods = { meta: false, ctrl: false, alt: false };

describe('classifyNavigationKey', () => {
  it('maps Enter to commit-down', () => {
    expect(classifyNavigationKey('Enter', noMods)).toBe('commit-down');
  });

  it('maps Escape to revert', () => {
    expect(classifyNavigationKey('Escape', noMods)).toBe('revert');
  });

  it('maps ArrowUp / ArrowDown to up / down', () => {
    expect(classifyNavigationKey('ArrowUp', noMods)).toBe('up');
    expect(classifyNavigationKey('ArrowDown', noMods)).toBe('down');
  });

  it('returns null for keys we want to flow through to the browser', () => {
    expect(classifyNavigationKey('Tab', noMods)).toBeNull();
    expect(classifyNavigationKey('ArrowLeft', noMods)).toBeNull();
    expect(classifyNavigationKey('ArrowRight', noMods)).toBeNull();
    expect(classifyNavigationKey('a', noMods)).toBeNull();
  });

  it('returns null when any modifier is held — Cmd / Ctrl / Alt shortcuts win', () => {
    expect(classifyNavigationKey('ArrowDown', { meta: true })).toBeNull();
    expect(classifyNavigationKey('Enter', { ctrl: true })).toBeNull();
    expect(classifyNavigationKey('ArrowUp', { alt: true })).toBeNull();
    expect(classifyNavigationKey('Escape', { meta: true })).toBeNull();
  });
});
