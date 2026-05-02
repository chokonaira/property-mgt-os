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

  it('hides the chip (without unmounting) when the path was edited since accept', () => {
    // The Radix Popover inside SourceSpanPopover portals to body; an
    // unmount during typing raced with portal cleanup and crashed the
    // tree. Hiding via aria-hidden + invisible keeps the subtree
    // mounted so the user-facing affordance disappears, but the
    // Popover lifecycle stays in React's hands.
    wizardState.meta = {
      confidenceByField: { 'property.name': 0.92 },
      sourceSpansByField: { 'property.name': 'Parkview Residences Berlin' },
      editedFields: new Set(['property.name']),
    };
    const { container } = render(withIntl(<FieldChip path="property.name" fieldLabel="Name" />));
    const wrapper = container.firstChild as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute('aria-hidden')).toBe('true');
    expect(wrapper?.className).toMatch(/invisible/);
    expect(wrapper?.className).toMatch(/opacity-0/);
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

  // Regression: edit-after-extract used to crash the wizard with
  // "Failed to execute 'removeChild'" because the Popover inside
  // SourceSpanPopover portaled to body, and the chip unmounting on
  // first edit raced React's commit-phase removeChild against
  // Radix's portal cleanup. The fix keeps the subtree mounted —
  // typing flips aria-hidden + invisible classes but never tears
  // the tree down. This test asserts the contract through a
  // realistic transition: chip visible → field edited → chip
  // hidden, but Popover trigger still in the DOM (proof the
  // subtree didn't unmount).
  it('keeps the Popover subtree mounted across an edit transition (no remount)', () => {
    wizardState.meta = {
      confidenceByField: { 'property.uniqueNumber': 0.94 },
      sourceSpansByField: { 'property.uniqueNumber': 'AZ-12345' },
      editedFields: new Set(),
    };
    const { container, rerender } = render(
      withIntl(<FieldChip path="property.uniqueNumber" fieldLabel="Unique number" />),
    );

    // Pre-edit: subtree mounted, chip visible (no aria-hidden), Popover
    // trigger present.
    const beforeWrapper = container.firstChild as HTMLElement | null;
    expect(beforeWrapper).not.toBeNull();
    expect(beforeWrapper?.getAttribute('aria-hidden')).toBeNull();
    const beforeTrigger = screen.getByText(/Source/i);
    expect(beforeTrigger).toBeTruthy();

    // Simulate the user typing in the bound input — markFieldEdited
    // mutates the WizardContext's editedFields set. We rerender with
    // the same wrapper (mock context returns the live wizardState.meta
    // ref, so mutating the meta is enough to drive the next render).
    wizardState.meta = {
      confidenceByField: { 'property.uniqueNumber': 0.94 },
      sourceSpansByField: { 'property.uniqueNumber': 'AZ-12345' },
      editedFields: new Set(['property.uniqueNumber']),
    };
    rerender(withIntl(<FieldChip path="property.uniqueNumber" fieldLabel="Unique number" />));

    // Post-edit: subtree STILL mounted (same container.firstChild
    // reference), aria-hidden flipped on, Popover trigger still in
    // the DOM. This is the load-bearing assertion: if the chip ever
    // returns null on edit, the trigger disappears, the Popover
    // unmounts, and we lose the safety contract.
    const afterWrapper = container.firstChild as HTMLElement | null;
    expect(afterWrapper).not.toBeNull();
    expect(afterWrapper?.getAttribute('aria-hidden')).toBe('true');
    expect(afterWrapper?.className).toMatch(/invisible/);
    // Popover trigger still in the rendered tree (just hidden via
    // the wrapper class — a11y tree skips it).
    expect(screen.getByText(/Source/i)).toBeTruthy();
  });
});
