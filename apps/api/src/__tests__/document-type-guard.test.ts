import { describe, expect, it } from 'vitest';
import { checkDocumentType } from '../modules/extraction/lib/document-type-guard';

// Real-world fixtures shaped like the kinds of text the PDF
// extractor hands the service. The classifier runs against
// already-extracted text, not the raw PDF, so layout artefacts
// (line breaks, bullet glyphs) aren't the concern here — the
// signal-or-no-signal question is.
const TEILUNGSERKLAERUNG_FIXTURE = `
TEILUNGSERKLÄRUNG (gemäß § 8 Wohnungseigentumsgesetz - WEG)

§ 1 Grundbuchstand und Eigentumsverhältnisse
Der Eigentümer erklärt die Aufteilung in Miteigentumsanteile …

§ 2 Objektbeschreibung
…

§ 3 Aufteilungsplan und Einheitenbeschreibung
1. Einheit Nr. 01 (Apartment)
`;

const RENTAL_CONTRACT_FIXTURE = `
MIETVERTRAG ÜBER WOHNRAUM

§ 1 Mietsache
Der Vermieter vermietet an den Mieter die Wohnung im 2. OG …

§ 2 Mietzeit
Das Mietverhältnis beginnt am 1. Juni 2026 …
`;

const INVOICE_FIXTURE = `
RECHNUNG NR. 2024/123
Datum: 15.03.2024

Position 1: Beratungsleistung … 1 200,00 EUR
Position 2: Nebenkosten ……………… 200,00 EUR

Summe: 1 400,00 EUR
`;

describe('checkDocumentType', () => {
  it('accepts a real Teilungserklärung — strong literal-term signal', () => {
    const r = checkDocumentType(TEILUNGSERKLAERUNG_FIXTURE);
    expect(r.ok).toBe(true);
    expect(r.matchedSignals).toContain('teilungserklarung');
  });

  it('accepts when both WEG + Miteigentumsanteil appear without the literal term', () => {
    // OCR sometimes drops the cover-page heading; the legal-frame
    // pair is enough on its own to identify the document.
    const text = `
      Der Eigentümer schließt gemäß WEG die Aufteilung in
      Miteigentumsanteile mit Verbindung zum Sondereigentum.
    `;
    const r = checkDocumentType(text);
    expect(r.ok).toBe(true);
    expect(r.matchedSignals).toEqual(expect.arrayContaining(['weg', 'miteigentumsanteil']));
  });

  it('accepts when paragraph-section structure + Aufteilungsplan appear without WEG terms', () => {
    const text = `
      § 1 Beschreibung
      § 2 Aufteilung

      Aufteilungsplan: siehe Anlage 1
    `;
    const r = checkDocumentType(text);
    expect(r.ok).toBe(true);
  });

  it('rejects a rental contract — has §-sections but no Teilungs- / WEG / Aufteilungsplan markers', () => {
    const r = checkDocumentType(RENTAL_CONTRACT_FIXTURE);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Teilungserklärung/);
  });

  it('rejects an invoice — none of the legal markers present', () => {
    const r = checkDocumentType(INVOICE_FIXTURE);
    expect(r.ok).toBe(false);
  });

  it('rejects empty text', () => {
    expect(checkDocumentType('').ok).toBe(false);
    expect(checkDocumentType('   \n\n   ').ok).toBe(false);
  });

  it('handles "Teilungserklarung" without umlaut (OCR fallback)', () => {
    expect(checkDocumentType('Teilungserklarung gemäß WEG').ok).toBe(true);
  });

  it('case-insensitive on Teilungserklärung', () => {
    expect(checkDocumentType('TEILUNGSERKLÄRUNG').ok).toBe(true);
    expect(checkDocumentType('teilungserklärung').ok).toBe(true);
  });

  it('returns the matched-signal list so operators can debug rejections', () => {
    // Rental contract has §-numbered sections so `paragraph_sections`
    // matches in isolation — but without the Aufteilungsplan pair it
    // is a WEAK signal and not enough to pass. The matched-signal
    // list still surfaces it so an operator triaging the rejection
    // can see what almost-matched.
    const r = checkDocumentType(RENTAL_CONTRACT_FIXTURE);
    expect(r.ok).toBe(false);
    expect(r.matchedSignals).toEqual(['paragraph_sections']);
  });

  it('matched-signal list is empty for a doc with zero markers', () => {
    const r = checkDocumentType(INVOICE_FIXTURE);
    expect(r.ok).toBe(false);
    expect(r.matchedSignals).toEqual([]);
  });
});
