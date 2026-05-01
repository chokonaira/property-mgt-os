// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { NextIntlClientProvider } from 'next-intl';
import { WizardMeaBar } from '@/components/unit-table/mea-bar';
import {
  type WizardDraftInput,
  WIZARD_DRAFT_DEFAULTS,
} from '@/lib/schemas/wizard-draft';
import enMessages from '../messages/en.json';

interface HarnessProps {
  defaults: WizardDraftInput;
}

function Harness({ defaults }: HarnessProps) {
  const methods = useForm<WizardDraftInput>({ defaultValues: defaults });
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <FormProvider {...methods}>
        <WizardMeaBar />
      </FormProvider>
    </NextIntlClientProvider>
  );
}

function draft(overrides: Partial<WizardDraftInput['general']> = {}): WizardDraftInput {
  return {
    ...WIZARD_DRAFT_DEFAULTS,
    general: {
      ...WIZARD_DRAFT_DEFAULTS.general,
      ...overrides,
    },
  };
}

describe('WizardMeaBar', () => {
  it('renders nothing for MV-managed properties', () => {
    const { container } = render(
      <Harness defaults={draft({ managementType: 'MV', totalMea: 1000 })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the running sum + declared total for WEG with green tone when matched', () => {
    const defaults: WizardDraftInput = {
      ...draft({ managementType: 'WEG', totalMea: 1000 }),
      buildings: [{ street: 'Hauptstr.', houseNumber: '1', label: 'Haus A' }],
      units: [
        {
          type: 'APARTMENT',
          buildingIndex: 0,
          number: '1',
          meaShare: 1000,
          sizeSqm: 80,
          rooms: 3,
        } as unknown as WizardDraftInput['units'][number],
      ],
    };
    render(<Harness defaults={defaults} />);
    // Σ shares = 1,000 / 1,000 — matched message reads "Sum matches…"
    expect(screen.getByText(/Σ shares = 1,000\.0 \/ 1,000\.0/)).toBeTruthy();
    expect(screen.getByText(/Sum matches the declared total/i)).toBeTruthy();
  });

  it('flags short tone when shares are under the declared total', () => {
    const defaults: WizardDraftInput = {
      ...draft({ managementType: 'WEG', totalMea: 1000 }),
      buildings: [{ street: 'Hauptstr.', houseNumber: '1', label: 'Haus A' }],
      units: [
        {
          type: 'APARTMENT',
          buildingIndex: 0,
          number: '1',
          meaShare: 900,
          sizeSqm: 80,
          rooms: 3,
        } as unknown as WizardDraftInput['units'][number],
      ],
    };
    render(<Harness defaults={defaults} />);
    expect(screen.getByText(/Σ shares = 900\.0 \/ 1,000\.0/)).toBeTruthy();
    expect(screen.getByText(/100\.0 shares unaccounted/)).toBeTruthy();
  });

  it('flags exceeded tone when shares overshoot the declared total', () => {
    const defaults: WizardDraftInput = {
      ...draft({ managementType: 'WEG', totalMea: 1000 }),
      buildings: [{ street: 'Hauptstr.', houseNumber: '1', label: 'Haus A' }],
      units: [
        {
          type: 'APARTMENT',
          buildingIndex: 0,
          number: '1',
          meaShare: 1100,
          sizeSqm: 80,
          rooms: 3,
        } as unknown as WizardDraftInput['units'][number],
      ],
    };
    render(<Harness defaults={defaults} />);
    expect(screen.getByText(/100\.0 shares over the declared total/)).toBeTruthy();
  });

  it('reveals per-building breakdown when the headline is clicked', async () => {
    const user = userEvent.setup();
    const defaults: WizardDraftInput = {
      ...draft({ managementType: 'WEG', totalMea: 1000 }),
      buildings: [
        { street: 'Hauptstr.', houseNumber: '1', label: 'Haus A' },
        { street: 'Nebenstr.', houseNumber: '5', label: 'Haus B' },
      ],
      units: [
        {
          type: 'APARTMENT',
          buildingIndex: 0,
          number: '1',
          meaShare: 600,
          sizeSqm: 80,
          rooms: 3,
        } as unknown as WizardDraftInput['units'][number],
        {
          type: 'APARTMENT',
          buildingIndex: 1,
          number: '2',
          meaShare: 400,
          sizeSqm: 65,
          rooms: 2,
        } as unknown as WizardDraftInput['units'][number],
      ],
    };
    render(<Harness defaults={defaults} />);
    const toggle = screen.getByRole('button', { expanded: false });
    await user.click(toggle);
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy();

    const breakdown = document.getElementById('wizard-mea-breakdown');
    expect(breakdown).not.toBeNull();
    const text = breakdown?.textContent ?? '';
    expect(text).toContain('Haus A');
    expect(text).toContain('600.0');
    expect(text).toContain('Haus B');
    expect(text).toContain('400.0');
  });
});
