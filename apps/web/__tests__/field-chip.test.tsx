// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '../messages/en.json';

interface MockExtractionMeta {
  confidenceByField: Record<string, number>;
  sourceSpansByField: Record<string, string>;
  editedFields: ReadonlySet<string>;
}

const wizardState: { meta: MockExtractionMeta | null } = { meta: null };

vi.mock('@/components/wizard/wizard-context', () => ({
  useWizard: () => ({
    validity: { general: false, buildings: false, units: false },
    registerValidator: () => {},
    setStepValid: () => {},
    validateStep: async () => false,
    reset: () => {},
    declarationFile: undefined,
    setDeclarationFile: () => {},
    extractionMeta: wizardState.meta,
    setExtractionMeta: () => {},
    markFieldEdited: () => {},
    hydrated: true,
  }),
}));

import { FieldChip } from '@/components/ai-extraction-review/field-chip';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  wizardState.meta = null;
});

describe('FieldChip', () => {
  it('renders nothing when no extraction has been accepted', () => {
    wizardState.meta = null;
    const { container } = render(withIntl(<FieldChip path="property.name" fieldLabel="Name" />));
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the path was edited since accept', () => {
    wizardState.meta = {
      confidenceByField: { 'property.name': 0.92 },
      sourceSpansByField: { 'property.name': 'Parkview Residences Berlin' },
      editedFields: new Set(['property.name']),
    };
    const { container } = render(withIntl(<FieldChip path="property.name" fieldLabel="Name" />));
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the path has neither confidence nor a source span', () => {
    wizardState.meta = {
      confidenceByField: {},
      sourceSpansByField: {},
      editedFields: new Set(),
    };
    const { container } = render(withIntl(<FieldChip path="property.name" fieldLabel="Name" />));
    expect(container.firstChild).toBeNull();
  });

  it('renders the chip + source link when extraction provenance exists', () => {
    wizardState.meta = {
      confidenceByField: { 'property.name': 0.92 },
      sourceSpansByField: { 'property.name': 'Parkview Residences Berlin' },
      editedFields: new Set(),
    };
    render(withIntl(<FieldChip path="property.name" fieldLabel="Name" />));
    expect(screen.getByText(/High/i)).toBeTruthy();
    expect(screen.getByText(/Source/i)).toBeTruthy();
  });

  it('renders an Unverified chip when score is missing but a span exists', () => {
    wizardState.meta = {
      confidenceByField: {},
      sourceSpansByField: { 'property.name': 'X' },
      editedFields: new Set(),
    };
    render(withIntl(<FieldChip path="property.name" fieldLabel="Name" />));
    expect(screen.getByText(/Unverified/i)).toBeTruthy();
  });

  it('source link opens a popover with the verbatim PDF span', async () => {
    wizardState.meta = {
      confidenceByField: { 'property.name': 0.92 },
      sourceSpansByField: { 'property.name': 'Parkview Residences Berlin' },
      editedFields: new Set(),
    };
    const user = userEvent.setup();
    render(withIntl(<FieldChip path="property.name" fieldLabel="Name" />));
    await user.click(screen.getByText(/Source/i));
    expect(screen.getByText(/Parkview Residences Berlin/)).toBeTruthy();
  });
});
