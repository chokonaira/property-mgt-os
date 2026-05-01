// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ExtractionRunResponse } from '@buena/shared';
import { AiReviewPanel } from '@/components/ai-extraction-review/ai-review-panel';
import enMessages from '../messages/en.json';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

function makeResult(overrides: Partial<ExtractionRunResponse> = {}): ExtractionRunResponse {
  return {
    runId: 'run-1',
    extraction: {
      property: {
        name: 'Parkview Residences Berlin',
        uniqueNumber: '10-557-PRB',
        managementType: 'WEG',
        totalMea: 1000,
      },
      buildings: [{ label: 'Haus A', street: 'Hauptstr.', houseNumber: '1' }],
      units: [
        { type: 'APARTMENT', number: '1.1', buildingLabel: 'Haus A', rooms: 3, sizeSqm: 80 },
      ],
      contacts: [],
      confidenceByField: { 'property.name': 0.92, 'property.uniqueNumber': 0.7 },
      sourceSpansByField: { 'property.name': 'Parkview Residences Berlin' },
      warnings: [],
    },
    warnings: [],
    confidence: 0.85,
    durationMs: 4500,
    cached: false,
    ...overrides,
  };
}

describe('AiReviewPanel', () => {
  it('renders the header, overall confidence and duration', () => {
    const result = makeResult();
    render(withIntl(<AiReviewPanel result={result} onAccept={() => {}} onDiscard={() => {}} />));
    expect(screen.getByText(/We read your document/i)).toBeTruthy();
    expect(screen.getByText(/Confidence 85/)).toBeTruthy();
    expect(screen.getByText(/4\.5 s/)).toBeTruthy();
  });

  it('shows the "served from cache" badge when result.cached is true', () => {
    const result = makeResult({ cached: true, durationMs: 0 });
    render(withIntl(<AiReviewPanel result={result} onAccept={() => {}} onDiscard={() => {}} />));
    expect(screen.getByText(/Served from cache/i)).toBeTruthy();
  });

  it('omits the cache badge when result.cached is false', () => {
    const result = makeResult({ cached: false });
    render(withIntl(<AiReviewPanel result={result} onAccept={() => {}} onDiscard={() => {}} />));
    expect(screen.queryByText(/Served from cache/i)).toBeNull();
  });

  it('renders warnings when present', () => {
    const result = makeResult({
      warnings: [
        {
          code: 'MEA_MISMATCH',
          message: 'Unit MEA shares sum to 900 but the document declares totalMea=1000.',
          fields: ['property.totalMea'],
        },
      ],
    });
    render(withIntl(<AiReviewPanel result={result} onAccept={() => {}} onDiscard={() => {}} />));
    expect(screen.getByRole('alert').textContent).toContain('MEA mismatch');
    expect(screen.getByRole('alert').textContent).toContain('900');
  });

  it('renders a section per extracted building with its address fields', () => {
    const result = makeResult({
      extraction: {
        ...makeResult().extraction,
        buildings: [
          { label: 'Haus A', street: 'Hauptstr.', houseNumber: '1', postalCode: '10115' },
          { label: 'Haus B', street: 'Nebenstr.', houseNumber: '2', city: 'Berlin' },
        ],
      },
    });
    const { container } = render(
      withIntl(<AiReviewPanel result={result} onAccept={() => {}} onDiscard={() => {}} />),
    );
    // Building label "Haus A" can also appear as a unit row's
    // buildingLabel cell, so query the buildings section directly.
    const buildingsSection = container.querySelector('[aria-labelledby="ai-review-buildings"]');
    expect(buildingsSection).not.toBeNull();
    const text = buildingsSection?.textContent ?? '';
    expect(text).toContain('Haus A');
    expect(text).toContain('Haus B');
    expect(text).toContain('Hauptstr.');
    expect(text).toContain('Nebenstr.');
    expect(text).toContain('10115');
    expect(text).toContain('Berlin');
  });

  it('renders one row per extracted unit with its key cells', () => {
    const result = makeResult({
      extraction: {
        ...makeResult().extraction,
        units: [
          { type: 'APARTMENT', number: '1.1', buildingLabel: 'Haus A', rooms: 3, sizeSqm: 80 },
          { type: 'PARKING', number: 'P1', buildingLabel: 'Haus A' },
          { type: 'GARDEN', number: 'G1', buildingLabel: 'Haus A' },
        ],
      },
    });
    render(withIntl(<AiReviewPanel result={result} onAccept={() => {}} onDiscard={() => {}} />));
    expect(screen.getByText('Apartment')).toBeTruthy();
    expect(screen.getByText('Parking')).toBeTruthy();
    expect(screen.getByText('Garden')).toBeTruthy();
    expect(screen.getByText('1.1')).toBeTruthy();
    expect(screen.getByText('P1')).toBeTruthy();
    expect(screen.getByText('80')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('shows an empty-state message when no units were extracted', () => {
    const result = makeResult({ extraction: { ...makeResult().extraction, units: [] } });
    render(withIntl(<AiReviewPanel result={result} onAccept={() => {}} onDiscard={() => {}} />));
    expect(screen.getByText(/No units extracted/i)).toBeTruthy();
  });

  it('shows the dropped-units note only when count > 0', () => {
    const result = makeResult();
    const { rerender } = render(
      withIntl(
        <AiReviewPanel result={result} onAccept={() => {}} onDiscard={() => {}} droppedUnits={0} />,
      ),
    );
    expect(screen.queryByText(/dropped from the pre-fill/)).toBeNull();
    rerender(
      withIntl(
        <AiReviewPanel result={result} onAccept={() => {}} onDiscard={() => {}} droppedUnits={2} />,
      ),
    );
    expect(screen.getByText(/2 units referenced unknown buildings/)).toBeTruthy();
  });

  it('invokes onAccept when the primary button is clicked', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const result = makeResult();
    render(withIntl(<AiReviewPanel result={result} onAccept={onAccept} onDiscard={() => {}} />));
    await user.click(screen.getByRole('button', { name: /Accept all & continue/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('invokes onDiscard when the secondary button is clicked', async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    const result = makeResult();
    render(withIntl(<AiReviewPanel result={result} onAccept={() => {}} onDiscard={onDiscard} />));
    await user.click(screen.getByRole('button', { name: /Discard & enter manually/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('renders only populated property fields (skips undefined property values)', () => {
    const result = makeResult({
      extraction: {
        ...makeResult().extraction,
        property: { name: 'Skinny', managementType: 'MV' },
      },
    });
    render(withIntl(<AiReviewPanel result={result} onAccept={() => {}} onDiscard={() => {}} />));
    expect(screen.getByText('Skinny')).toBeTruthy();
    expect(screen.getByText('MV')).toBeTruthy();
    // Property section omits empty rows; the unit table renders dashes
    // for missing per-cell values, which is intentional.
    expect(screen.queryByText('Unique number')).toBeNull();
  });
});
