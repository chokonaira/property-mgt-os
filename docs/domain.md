# Domain — German Property Management

A short reference for the domain concepts the application touches. Captured from the case-study brief and the sample Teilungserklärung document.

---

## Property types

### WEG — Wohnungseigentumsgesetz

A condominium owners' association. Owners individually hold _Sondereigentum_ (their apartment / unit) and jointly hold _Gemeinschaftseigentum_ (common areas — roof, stairs, façade, lobby). Decisions about common areas are made by votes weighted by co-ownership share.

Implications for the data model:

- The founding legal document is a **Teilungserklärung** (declaration of division per § 8 WEG).
- **Miteigentumsanteile (MEA)** — co-ownership shares — sum to a fixed total, almost always 1000 (occasionally 10,000 for very large properties). Each unit's MEA determines voting weight and cost share.
- A WEG has a **WEG-Verwalter** (property manager, regulated role) and a **Buchhaltung** (accountant) producing the annual _Jahresabrechnung_.
- May contain **Sondernutzungsrechte** — exclusive rights to use specific common areas (e.g., a particular terrace or garden patch).

### MV — Mietverwaltung

Rental property management on behalf of a single landlord. No co-owners; a small number of owners with tenants.

Implications:

- No MEA, no Teilungserklärung, no WEG-Verwalter.
- Domain centers on tenant contracts, rent collection, and maintenance.
- The data model has a different shape: a single owner, units have leases, no community decisions.

This implementation supports both via a discriminated `managementType` on Property. WEG drives the document-extraction and MEA-invariant logic; MV uses a reduced General Info form and skips the MEA fields.

---

## The Teilungserklärung

The sample document is a 5-page declaration for "Parkview Residences Berlin." Its structure:

### Header

- **Urkundenrolle Nr.** — the notarial roll number (`2024/05-B`).
- **Notarization date and place** — `15. März 2024, Berlin`.
- **Document type** — `TEILUNGSERKLÄRUNG (gemäß § 8 WEG)`.

### § 1 Grundbuchstand und Eigentumsverhältnisse

- Owner / declarant.
- Land registry references: Grundbuch, Gemarkung, Flur, Flurstück.
- Total parcel area.
- Property name and internal object number.
- Verwaltungstyp (WEG).

### § 2 Objektbeschreibung und Gebäudedaten

Each building described with:

- Label and nickname (e.g., "Haus A — Parkside").
- Address.
- Year built.
- Floor count.
- Lift y/n.
- Building type (residential, mixed-use).
- Energy standard (e.g., KfW 40).
- Heating (e.g., Fernwärme).

### § 3 Aufteilungsplan und Einheitenbeschreibung

Each unit:

- Sequential number.
- Type (Apartment, Office, Parking, Garden).
- MEA share (as numerator over the total).
- Building and floor.
- Entrance designation.
- Size in m² (Wohnfläche for apartments, Nutzfläche for offices and parking, plain m² for outdoor).
- Rooms (apartments only).
- Year built.
- Sub-category (Penthouse, Eckwohnung, etc.) and prose description.

### § 4 Sondernutzungsrechte

Exclusive use rights mapping units to non-Sondereigentum areas. Out of v1 scope as an editable feature.

### § 5 Erstbestellung von Verwaltung und Buchhaltung

Initial appointment of the property manager and the accountant. These are companies, not individuals, with their own addresses.

### § 6 Schlussbestimmungen

Closing legal boilerplate. Not extracted.

---

## Sample document at a glance

The sample property is "Parkview Residences Berlin," 14 units across 2 buildings:

| #     | Type                  | MEA / 1000 | Building     | Floor          | Size         | Rooms |
| ----- | --------------------- | ---------- | ------------ | -------------- | ------------ | ----- |
| 01    | Apartment             | 110.0      | Haus A       | EG             | 95 m²        | 3     |
| 02    | Apartment             | 108.0      | Haus A       | EG             | 92.5 m²      | 3     |
| 03    | Apartment             | 120.0      | Haus A       | 1.OG           | 105 m²       | 4     |
| 04    | Apartment             | 90.0       | Haus A       | 2.OG           | 78 m²        | 2     |
| 05    | Apartment (Penthouse) | 160.0      | Haus A       | 4.OG (Staffel) | 145 m²       | 4     |
| 06    | Office                | 125.0      | Haus B       | EG             | 110 m²       | —     |
| 07    | Apartment             | 75.0       | Haus B       | 1.OG           | 65 m²        | 2     |
| 08    | Apartment             | 102.0      | Haus B       | 2.OG           | 88 m²        | 3     |
| 09–13 | Parking (TG-01..05)   | 1.0 each   | Tiefgarage   | UG             | 12.5 m² each | —     |
| 14    | Garden                | 5.0        | Außen Haus A | EG             | 40 m²        | —     |

**Sum of unit MEA shares: 900.0 / 1000.** The document declares 1000 total, but the unit shares sum to 900 — 100 unaccounted for. The application surfaces this as a non-blocking warning so the user is alerted but not prevented from proceeding. In production, this is exactly the kind of drafting omission that should be flagged for human review rather than silently accepted.

---

## Vocabulary cheat sheet

| German                        | English                                | Notes                                    |
| ----------------------------- | -------------------------------------- | ---------------------------------------- |
| Teilungserklärung             | Declaration of division                | Founding legal document for a WEG        |
| Wohnungseigentumsgesetz (WEG) | Condominium Property Act               | The German law                           |
| Sondereigentum                | Exclusive property                     | What is exclusively owned                |
| Gemeinschaftseigentum         | Common property                        | What is shared                           |
| Sondernutzungsrecht           | Special use right                      | Exclusive use of part of common property |
| Miteigentumsanteil (MEA)      | Co-ownership share                     | Per-unit fraction of a fixed total       |
| Aufteilungsplan               | Division plan                          | Architectural drawing of units           |
| Verwalter                     | Property manager                       | Regulated under WEG                      |
| Buchhaltung                   | Accountant                             | Annual statement preparer                |
| Wohnfläche                    | Living area                            | Apartments                               |
| Nutzfläche                    | Utility / commercial area              | Offices, parking                         |
| Erdgeschoss (EG)              | Ground floor                           | Floor 0                                  |
| 1. Obergeschoss (1.OG)        | First floor (above ground)             |                                          |
| Staffelgeschoss               | Recessed top floor                     | Often the penthouse                      |
| Untergeschoss (UG)            | Basement                               | Floor -1                                 |
| Tiefgarage                    | Underground garage                     | Where parking units live                 |
| Eingang                       | Entrance                               | Building entrance                        |
| Treppenhaus                   | Stairwell                              | Used as entrance qualifier               |
| Baujahr                       | Construction year                      |                                          |
| KfW 40 / KfW 55               | Energy efficiency standard             | German federal codes                     |
| Fernwärme                     | District heating                       |                                          |
| Grundbuch                     | Land registry                          | The official land book                   |
| Gemarkung / Flur / Flurstück  | Cadastral district / sub-area / parcel | Hierarchical land identifiers            |
| Urkundenrolle                 | Notarial roll                          | Sequential notarial act number           |
| Mietverwaltung (MV)           | Rental management                      | The non-WEG flow                         |

---

## German number and date formats

- Decimal separator: comma. `110,0` is `110.0`.
- Thousands separator: dot. `1.000` is `1000`.
- Combined: `110,0/1.000` is `110.0 / 1000`.
- Dates: `15. März 2024` or `15.03.2024`.
- Sizes: `95,00 m²`.

The application accepts both German and English numeric input from the UI and stores canonical numbers internally; display is per locale.

---

## Floor representation

A discriminated union rather than free text or an integer:

```ts
type Floor =
  | { kind: 'EG' }
  | { kind: 'OG'; level: number; qualifier?: string }
  | { kind: 'UG'; level: number }
  | { kind: 'DG' }
  | { kind: 'STAFFEL' };
```

Display labels are computed: `EG`, `1.OG`, `4.OG (Penthouse)`, `Staffelgeschoss`.

---

## Validations

Domain rules enforced in the application:

1. MEA invariant for WEG properties: sum of unit shares should equal the property's declared total. Mismatch surfaces as a non-blocking warning.
2. Unit numbers unique within a building.
3. Required fields per unit type, enforced by the discriminated Zod schema.
4. Building must belong to the property in the same flow.
5. Postal codes match `\d{5}`.
6. Year of construction `≥ 1800`, `≤ current year + 1` (off-plan permitted).
7. MEA values positive, decimal precision 1.

---

## Visible domain quality in the UI

- A live, sticky MEA total bar on the units step: `Σ shares = 900.0 / 1000.0` with a green/yellow indicator.
- Discriminated unit type tabs with type-specific forms.
- Structured floor picker (kind + optional level).
- German domain terms preserved alongside English clarification (Teilungserklärung, MEA, WEG, MV).
- Per-field AI confidence chips on extracted values.
