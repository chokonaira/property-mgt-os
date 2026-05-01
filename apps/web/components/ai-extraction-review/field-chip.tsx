'use client';

import { useWizard } from '@/components/wizard/wizard-context';
import { ConfidenceChip } from './confidence-chip';
import { SourceSpanPopover } from './source-span-popover';

interface FieldChipProps {
  /**
   * Dotted path used by the server's `confidenceByField` /
   * `sourceSpansByField` maps. Examples:
   *   - "property.name"
   *   - "buildings[0].street"
   *   - "units[3].rooms"
   * The path is also used as the key in `editedFields` so
   * editing the field clears the chip.
   */
  path: string;
  fieldLabel: string;
  className?: string;
}

/**
 * Provenance affordance rendered next to AI-pre-filled inputs.
 * Renders nothing when:
 *   - no extraction is in flight (`extractionMeta` is null)
 *   - the user has edited this field since accept
 *   - the path has neither confidence nor a verified source span
 *
 * Reading from WizardContext keeps callers a one-liner; the chip
 * doesn't need to know which step it lives on or which RHF path
 * the surrounding input uses.
 */
export function FieldChip({ path, fieldLabel, className }: FieldChipProps) {
  const { extractionMeta } = useWizard();
  if (!extractionMeta) return null;
  if (extractionMeta.editedFields.has(path)) return null;
  const score = extractionMeta.confidenceByField[path];
  const span = extractionMeta.sourceSpansByField[path];
  if (score === undefined && !span) return null;
  return (
    <span className={className ? `inline-flex items-center gap-1.5 ${className}` : 'inline-flex items-center gap-1.5'}>
      <ConfidenceChip score={score} verified={Boolean(span)} />
      <SourceSpanPopover span={span} fieldLabel={fieldLabel} />
    </span>
  );
}
