// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { LastSavedIndicator } from '@/components/wizard/last-saved-indicator';
import enMessages from '../messages/en.json';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

describe('LastSavedIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when nothing has been saved yet', () => {
    const { container } = render(withIntl(<LastSavedIndicator lastSavedAt={null} />));
    expect(container.firstChild).toBeNull();
  });

  it('renders "Just saved" when the last save is under five seconds old', () => {
    const now = Date.now();
    render(withIntl(<LastSavedIndicator lastSavedAt={now - 1_000} />));
    expect(screen.getByText(/Just saved/i)).toBeTruthy();
  });

  it('renders "Saved N seconds ago" between five and sixty seconds', () => {
    const now = Date.now();
    render(withIntl(<LastSavedIndicator lastSavedAt={now - 30_000} />));
    expect(screen.getByText(/Saved 30 seconds ago/)).toBeTruthy();
  });

  it('renders "Saved N minutes ago" between one and sixty minutes', () => {
    const now = Date.now();
    render(withIntl(<LastSavedIndicator lastSavedAt={now - 5 * 60_000} />));
    expect(screen.getByText(/Saved 5 minutes ago/)).toBeTruthy();
  });

  it('renders "Saved N hours ago" past sixty minutes', () => {
    const now = Date.now();
    render(withIntl(<LastSavedIndicator lastSavedAt={now - 2 * 60 * 60_000} />));
    expect(screen.getByText(/Saved 2 hours ago/)).toBeTruthy();
  });
});
