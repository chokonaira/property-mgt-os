import type { ExtractionResult } from '@buena/shared';

/**
 * Few-shot anchor — one example pair grounds the model on the
 * Parkview Residences sample document. Stored as a real
 * ExtractionResult so any drift in the wire shape fails type-check
 * before it gets sent to OpenAI. Loaded into the chat-completion
 * messages as a (user, assistant) pair before the live document.
 */
export const FEW_SHOT_USER_TEXT = `[Excerpt from the Parkview Residences sample PDF]
Das gesamte Objekt wird unter dem Namen "Parkview Residences Berlin" geführt; intern trägt es zur Identifikation die Objektnummer 10-557-PRB.

Das Eigentum am Grundstück wird in 1.000 Miteigentumsanteile (MEA) zerlegt. Die Gesamtgrundfläche beträgt 2.450 m².

Notarvertrag UR-Nr. 2024/05-B, beurkundet am 15. März 2024.
Grundbuchamt Berlin-Mitte, Blatt 12345, Gemarkung Berlin-Mitte, Flur 12, Flurstück 456/78.

Haus A (Parkside): Am Fiktivpark 12, 10557 Berlin. KfW 40, Fernwärme, Aufzug, Wohngebäude, Baujahr 2023.
Haus B (Cityside): Urbanstraße 88, 10557 Berlin. KfW 40, Fernwärme, Aufzug, Mischgebäude, Baujahr 2023.

Wohneinheit Nr. 01 — Erdgeschoss links, Eingang A (Haupteingang), Wohnfläche 95 m², 3 Zimmer, MEA 110,0/1.000.
…
Tiefgaragenstellplätze TG-01 bis TG-05 (Einheiten Nr. 09 bis 13), je MEA 1,0/1.000.
Hobbygarten Nr. 14, Größe 40 m², MEA 5,0/1.000.

Verwaltung WEG: immoGuard Berlin GmbH, Musterstraße 1, 10115 Berlin.
Buchhaltung: FinanzExpertise Müller & Co KG, Rechnungsallee 99, 10557 Berlin.
`;

export const FEW_SHOT_ASSISTANT_RESULT: ExtractionResult = {
  property: {
    name: 'Parkview Residences Berlin',
    uniqueNumber: '10-557-PRB',
    managementType: 'WEG',
    totalMea: 1000,
    notarialRollNo: '2024/05-B',
    notarizedAt: '2024-03-15',
    grundbuchOffice: 'Berlin-Mitte',
    grundbuchSheet: 'Blatt 12345',
    gemarkung: 'Berlin-Mitte',
    flur: '12',
    flurstueck: '456/78',
    totalAreaSqm: 2450,
  },
  buildings: [
    {
      label: 'Haus A',
      nickname: 'Parkside',
      street: 'Am Fiktivpark',
      houseNumber: '12',
      postalCode: '10557',
      city: 'Berlin',
      country: 'DE',
      yearBuilt: 2023,
      floorsCount: 5,
      hasElevator: true,
      energyStandard: 'KfW 40',
      heating: 'Fernwärme',
      buildingType: 'Wohngebäude',
    },
    {
      label: 'Haus B',
      nickname: 'Cityside',
      street: 'Urbanstraße',
      houseNumber: '88',
      postalCode: '10557',
      city: 'Berlin',
      country: 'DE',
      yearBuilt: 2023,
      floorsCount: 4,
      hasElevator: true,
      energyStandard: 'KfW 40',
      heating: 'Fernwärme',
      buildingType: 'Mischgebäude',
    },
  ],
  units: [
    {
      type: 'APARTMENT',
      number: '01',
      buildingLabel: 'Haus A',
      floor: { kind: 'EG' },
      entranceLabel: 'A',
      entranceNote: 'Haupteingang',
      sizeSqm: 95,
      rooms: 3,
      meaShare: 110,
      yearBuilt: 2023,
      subCategory: 'Erdgeschosswohnung',
      description: 'Erdgeschosswohnung links gelegen, inklusive Terrasse',
    },
    {
      type: 'PARKING',
      number: '09',
      buildingLabel: 'Haus A',
      parkingCode: 'TG-01',
      sizeSqm: 12.5,
      meaShare: 1,
      yearBuilt: 2023,
      description: 'Tiefgaragenstellplatz',
    },
    {
      type: 'GARDEN',
      number: '14',
      buildingLabel: 'Haus A',
      sizeSqm: 40,
      meaShare: 5,
      yearBuilt: 2023,
      description: 'Private Gartenparzelle (Hobbygarten)',
    },
  ],
  contacts: [
    {
      role: 'PROPERTY_MANAGER',
      name: 'immoGuard Berlin GmbH',
      street: 'Musterstraße',
      houseNumber: '1',
      postalCode: '10115',
      city: 'Berlin',
    },
    {
      role: 'ACCOUNTANT',
      name: 'FinanzExpertise Müller & Co KG',
      street: 'Rechnungsallee',
      houseNumber: '99',
      postalCode: '10557',
      city: 'Berlin',
    },
  ],
  confidenceByField: {
    'property.name': 0.98,
    'property.uniqueNumber': 0.95,
    'property.totalMea': 0.99,
    'buildings[0].street': 0.95,
    'buildings[1].buildingType': 0.85,
    'units[0].rooms': 0.9,
  },
  sourceSpansByField: {
    'property.name': 'Das gesamte Objekt wird unter dem Namen "Parkview Residences Berlin" geführt',
    'property.uniqueNumber': 'trägt es zur Identifikation die Objektnummer 10-557-PRB',
    'property.totalMea':
      'Das Eigentum am Grundstück wird in 1.000 Miteigentumsanteile (MEA) zerlegt',
  },
  warnings: [
    {
      code: 'MEA_MISMATCH',
      message:
        'Unit MEA shares sum to 116.0 in this excerpt; the document declares totalMea=1000. Continue extraction for the remaining units.',
      fields: ['property.totalMea', 'units[*].meaShare'],
    },
  ],
};
