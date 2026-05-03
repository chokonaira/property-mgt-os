/**
 * Pre-LLM document-type classifier. Rejects PDFs that are clearly
 * not a German Teilungserklärung BEFORE we burn an LLM call trying
 * to fit them into the schema.
 *
 * Why heuristic and not an LLM classifier: a regex pass over the
 * already-extracted text is free + zero-latency + deterministic.
 * The shape of a Teilungserklärung is very specific (mandatory
 * legal terms in fixed phrasing) so a small set of must-have
 * signals catches the wrong-document case without false-rejecting
 * real ones. If the heuristic ever produces false negatives we'd
 * see it in the audit table — `not_teilungserklarung` failures on
 * documents that an operator confirms are valid Teilungserklärungen
 * — and tighten then.
 *
 * Signals (each independent — we OR them so a single missing
 * keyword doesn't kill a real doc):
 *
 *   STRONG: "Teilungserklärung" / "Teilungserklarung" mentioned at
 *           least once. The document IS named this; if it's missing
 *           we're almost certainly looking at something else.
 *   STRONG: "Wohnungseigentumsgesetz" / "WEG" appears alongside
 *           "Miteigentumsanteil" — together those define the
 *           legal frame, no other German document type uses both.
 *   WEAK:   §-numbered sections AND "Aufteilungsplan" — the
 *           structural signature of a notarised division deed.
 *
 * One STRONG match passes. Two WEAK signals together also pass
 * (handles OCRs that lost the literal term but kept the structure).
 */
export interface DocumentTypeCheck {
  ok: boolean;
  /** Diagnostic — included in the error envelope so an operator can
   *  understand WHY a doc was rejected without re-running it. */
  reason?: string;
  /** The matched signals; useful for telemetry + tuning the rules. */
  matchedSignals?: ReadonlyArray<string>;
}

const RX_TEILUNGSERKLARUNG = /Teilungserkl(?:ä|a)rung/i;
const RX_WEG = /\bWEG\b|Wohnungseigentumsgesetz/;
const RX_MITEIGENTUMSANTEIL = /Miteigentumsanteil/i;
const RX_PARAGRAPH_SECTIONS = /§\s*1\b[\s\S]*§\s*2\b/;
const RX_AUFTEILUNGSPLAN = /Aufteilungsplan/i;

export function checkDocumentType(rawText: string): DocumentTypeCheck {
  const text = rawText.normalize('NFC');
  const matched: string[] = [];

  if (RX_TEILUNGSERKLARUNG.test(text)) matched.push('teilungserklarung');
  if (RX_WEG.test(text)) matched.push('weg');
  if (RX_MITEIGENTUMSANTEIL.test(text)) matched.push('miteigentumsanteil');
  if (RX_PARAGRAPH_SECTIONS.test(text)) matched.push('paragraph_sections');
  if (RX_AUFTEILUNGSPLAN.test(text)) matched.push('aufteilungsplan');

  // STRONG signals
  const hasNamedTerm = matched.includes('teilungserklarung');
  const hasLegalFrame = matched.includes('weg') && matched.includes('miteigentumsanteil');
  // WEAK pair
  const hasStructure =
    matched.includes('paragraph_sections') && matched.includes('aufteilungsplan');

  if (hasNamedTerm || hasLegalFrame || hasStructure) {
    return { ok: true, matchedSignals: matched };
  }

  return {
    ok: false,
    reason:
      'Document does not appear to be a Teilungserklärung — none of the required ' +
      'legal markers (Teilungserklärung, Wohnungseigentumsgesetz/WEG + Miteigentumsanteil, ' +
      'or §-numbered sections + Aufteilungsplan) were found.',
    matchedSignals: matched,
  };
}
