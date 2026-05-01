/**
 * Drops sourceSpansByField entries that don't appear verbatim in the
 * PDF text — protection against hallucinated citations. A field whose
 * span fails verification flips its UI chip to "Unverified" (grey).
 *
 * Comparison is a normalised substring check: collapse runs of
 * whitespace to a single space + strip soft hyphens (German PDFs
 * ship a lot of those). Real PDF text often has wrapped lines that
 * still ought to match a model-emitted single-line citation.
 */

export interface VerifySpansResult {
  /** Spans that survived. Same shape as the input map. */
  verified: Record<string, string>;
  /** Field paths whose spans were dropped — useful for warnings. */
  unverified: string[];
}

const NORMALISE_RE = /[­]/g; // soft hyphens
const WHITESPACE_RE = /\s+/g;

function normalise(text: string): string {
  return text.replace(NORMALISE_RE, '').replace(WHITESPACE_RE, ' ').trim().toLowerCase();
}

export function verifySpans(
  spans: Record<string, string> | undefined,
  sourceText: string,
): VerifySpansResult {
  if (!spans) return { verified: {}, unverified: [] };
  const haystack = normalise(sourceText);
  const verified: Record<string, string> = {};
  const unverified: string[] = [];
  for (const [field, span] of Object.entries(spans)) {
    const needle = normalise(span);
    if (needle.length === 0) {
      unverified.push(field);
      continue;
    }
    if (haystack.includes(needle)) {
      verified[field] = span;
    } else {
      unverified.push(field);
    }
  }
  return { verified, unverified };
}
