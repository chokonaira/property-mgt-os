'use client';

import { cn } from '@/lib/utils';
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
 *
 * Returns null only when the chip would have nothing to show — no
 * extraction in flight or no data for this path. When the user has
 * EDITED the field, we don't unmount: we hide the chip visually +
 * remove it from focus / a11y trees, but keep the React subtree
 * mounted. The Radix Popover inside SourceSpanPopover portals its
 * content to document.body; if we unmounted mid-edit while a popover
 * was open or mid-animation, React's `removeChild` raced with
 * Radix's portal cleanup and threw a NotFoundError up to the error
 * boundary. Hiding-not-unmounting keeps the Popover lifecycle in the
 * user's hands (close it explicitly) and the tree stable for React.
 */
export function FieldChip({ path, fieldLabel, className }: FieldChipProps) {
  const { extractionMeta } = useWizard();
  if (!extractionMeta) return null;
  const score = extractionMeta.confidenceByField[path];
  const span = extractionMeta.sourceSpansByField[path];
  if (score === undefined && !span) return null;
  const isEdited = extractionMeta.editedFields.has(path);
  return (
    <span
      aria-hidden={isEdited || undefined}
      className={cn(
        'inline-flex items-center gap-1.5 transition-opacity',
        isEdited && 'pointer-events-none invisible h-0 w-0 overflow-hidden opacity-0',
        className,
      )}
    >
      <ConfidenceChip score={score} verified={Boolean(span)} />
      <SourceSpanPopover span={span} fieldLabel={fieldLabel} />
    </span>
  );
}
