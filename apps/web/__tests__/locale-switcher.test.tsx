// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const replace = vi.fn();
const useLocaleMock = vi.fn(() => 'en');

vi.mock('next-intl', () => ({
  useLocale: () => useLocaleMock(),
}));

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/properties/new',
  useRouter: () => ({ replace }),
}));

vi.mock('@/i18n/routing', () => ({
  locales: ['de', 'en'] as const,
}));

import { LocaleSwitcher } from '@/components/locale-switcher';

describe('LocaleSwitcher', () => {
  it('renders both locales as buttons with the active one bold and pressed', () => {
    useLocaleMock.mockReturnValue('en');
    render(<LocaleSwitcher />);
    const en = screen.getByRole('button', { name: 'English' });
    const de = screen.getByRole('button', { name: 'Deutsch' });
    expect(en.getAttribute('aria-pressed')).toBe('true');
    expect(de.getAttribute('aria-pressed')).toBe('false');
    expect(en.className).toMatch(/font-bold/);
    expect(de.className).not.toMatch(/font-bold/);
    // Active locale's button is non-interactive (clicking it would
    // navigate to the same place); only the inactive one should be
    // clickable.
    expect((en as HTMLButtonElement).disabled).toBe(true);
    expect((de as HTMLButtonElement).disabled).toBe(false);
  });

  it('routes to the chosen locale on click', async () => {
    useLocaleMock.mockReturnValue('en');
    replace.mockClear();
    render(<LocaleSwitcher />);
    await userEvent.click(screen.getByRole('button', { name: 'Deutsch' }));
    expect(replace).toHaveBeenCalledWith('/properties/new', { locale: 'de' });
  });

  it('flips active state when the locale changes', () => {
    useLocaleMock.mockReturnValue('de');
    render(<LocaleSwitcher />);
    expect(screen.getByRole('button', { name: 'Deutsch' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});
