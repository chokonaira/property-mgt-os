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

  it('renders building + unit counts in the summary', () => {
    const result = makeResult({
      extraction: {
        ...makeResult().extraction,
        buildings: [
          { label: 'Haus A', street: 'X', houseNumber: '1' },
          { label: 'Haus B', street: 'Y', houseNumber: '2' },
        ],
        units: [
          { type: 'APARTMENT', number: '1', buildingLabel: 'Haus A', rooms: 3, sizeSqm: 80 },
          { type: 'PARKING', number: 'P1', buildingLabel: 'Haus A' },
          { type: 'GARDEN', number: 'G1', buildingLabel: 'Haus B' },
        ],
      },
    });
    render(withIntl(<AiReviewPanel result={result} onAccept={() => {}} onDiscard={() => {}} />));
    const summary = screen.getByLabelText(/Summary/i);
    expect(summary.textContent).toContain('2');
    expect(summary.textContent).toContain('3');
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

  it('renders only populated property fields (skips undefined values)', () => {
    const result = makeResult({
      extraction: {
        ...makeResult().extraction,
        property: { name: 'Skinny', managementType: 'MV' },
      },
    });
    render(withIntl(<AiReviewPanel result={result} onAccept={() => {}} onDiscard={() => {}} />));
    expect(screen.getByText('Skinny')).toBeTruthy();
    expect(screen.getByText('MV')).toBeTruthy();
    expect(screen.queryByText('—')).toBeNull();
  });
});
