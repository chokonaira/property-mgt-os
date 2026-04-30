import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { id: 'demo' },
    update: {},
    create: { id: 'demo', name: 'Demo Tenant' },
  });

  await prisma.property.deleteMany({
    where: { tenantId: tenant.id, uniqueNumber: '10-557-PRB' },
  });

  const propertyManager = await prisma.contact.create({
    data: {
      tenantId: tenant.id,
      name: 'immoGuard Berlin GmbH',
      role: 'WEG-Verwalter',
      street: 'Musterstraße',
      houseNumber: '1',
      postalCode: '10115',
      city: 'Berlin',
    },
  });

  const accountant = await prisma.contact.create({
    data: {
      tenantId: tenant.id,
      name: 'FinanzExpertise Müller & Co KG',
      role: 'Buchhaltung',
      street: 'Rechnungsallee',
      houseNumber: '99',
      postalCode: '10557',
      city: 'Berlin',
    },
  });

  const property = await prisma.property.create({
    data: {
      tenantId: tenant.id,
      name: 'Parkview Residences Berlin',
      uniqueNumber: '10-557-PRB',
      managementType: 'WEG',
      totalMea: '1000.00',
      notarialRollNo: '2024/05-B',
      notarizedAt: new Date('2024-03-15'),
      grundbuchOffice: 'Berlin-Mitte',
      grundbuchSheet: 'Blatt 12345',
      gemarkung: 'Berlin-Mitte',
      flur: '12',
      flurstueck: '456/78',
      totalAreaSqm: '2450.00',
      propertyManagerId: propertyManager.id,
      accountantId: accountant.id,
    },
  });

  const hausA = await prisma.building.create({
    data: {
      propertyId: property.id,
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
  });

  const hausB = await prisma.building.create({
    data: {
      propertyId: property.id,
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
  });

  const units: Prisma.UnitCreateManyInput[] = [
    // Haus A — 5 apartments + 5 parking + 1 garden
    {
      buildingId: hausA.id,
      number: '01',
      type: 'APARTMENT',
      floorKind: 'EG',
      floorLevel: 0,
      entranceLabel: 'A',
      entranceNote: 'Haupteingang',
      sizeSqm: '95.00',
      areaMetric: 'WOHN',
      meaShare: '110.00',
      rooms: 3,
      yearBuilt: 2023,
      subCategory: 'Erdgeschosswohnung',
      description: 'Erdgeschosswohnung links gelegen, inklusive Terrasse',
    },
    {
      buildingId: hausA.id,
      number: '02',
      type: 'APARTMENT',
      floorKind: 'OG',
      floorLevel: 1,
      entranceLabel: 'A',
      sizeSqm: '92.00',
      areaMetric: 'WOHN',
      meaShare: '110.00',
      rooms: 3,
      yearBuilt: 2023,
    },
    {
      buildingId: hausA.id,
      number: '03',
      type: 'APARTMENT',
      floorKind: 'OG',
      floorLevel: 2,
      entranceLabel: 'A',
      sizeSqm: '92.00',
      areaMetric: 'WOHN',
      meaShare: '110.00',
      rooms: 3,
      yearBuilt: 2023,
    },
    {
      buildingId: hausA.id,
      number: '04',
      type: 'APARTMENT',
      floorKind: 'OG',
      floorLevel: 3,
      entranceLabel: 'A',
      sizeSqm: '92.00',
      areaMetric: 'WOHN',
      meaShare: '110.00',
      rooms: 3,
      yearBuilt: 2023,
    },
    {
      buildingId: hausA.id,
      number: '05',
      type: 'APARTMENT',
      floorKind: 'DG',
      floorLevel: 4,
      floorQualifier: 'Penthouse',
      entranceLabel: 'A',
      sizeSqm: '110.00',
      areaMetric: 'WOHN',
      meaShare: '110.00',
      rooms: 4,
      yearBuilt: 2023,
      subCategory: 'Penthouse',
    },
    {
      buildingId: hausA.id,
      number: '09',
      type: 'PARKING',
      floorKind: 'UG',
      sizeSqm: '12.50',
      areaMetric: 'NUTZ',
      meaShare: '1.00',
      yearBuilt: 2023,
      subCategory: 'TG-01',
      description: 'Tiefgaragenstellplatz',
    },
    {
      buildingId: hausA.id,
      number: '10',
      type: 'PARKING',
      floorKind: 'UG',
      sizeSqm: '12.50',
      areaMetric: 'NUTZ',
      meaShare: '1.00',
      yearBuilt: 2023,
      subCategory: 'TG-02',
      description: 'Tiefgaragenstellplatz',
    },
    {
      buildingId: hausA.id,
      number: '11',
      type: 'PARKING',
      floorKind: 'UG',
      sizeSqm: '12.50',
      areaMetric: 'NUTZ',
      meaShare: '1.00',
      yearBuilt: 2023,
      subCategory: 'TG-03',
      description: 'Tiefgaragenstellplatz',
    },
    {
      buildingId: hausA.id,
      number: '12',
      type: 'PARKING',
      floorKind: 'UG',
      sizeSqm: '12.50',
      areaMetric: 'NUTZ',
      meaShare: '1.00',
      yearBuilt: 2023,
      subCategory: 'TG-04',
      description: 'Tiefgaragenstellplatz',
    },
    {
      buildingId: hausA.id,
      number: '13',
      type: 'PARKING',
      floorKind: 'UG',
      sizeSqm: '12.50',
      areaMetric: 'NUTZ',
      meaShare: '1.00',
      yearBuilt: 2023,
      subCategory: 'TG-05',
      description: 'Tiefgaragenstellplatz',
    },
    {
      buildingId: hausA.id,
      number: '14',
      type: 'GARDEN',
      sizeSqm: '40.00',
      areaMetric: 'GROUND',
      meaShare: '20.00',
      yearBuilt: 2023,
      description:
        'Private Gartenparzelle zur Erholungsnutzung (Hobbygarten), rechtlich verselbstständigt',
    },

    // Haus B — 1 office + 2 apartments
    {
      buildingId: hausB.id,
      number: '06',
      type: 'OFFICE',
      floorKind: 'EG',
      floorLevel: 0,
      entranceLabel: 'B',
      entranceNote: 'separater Eingang',
      sizeSqm: '110.00',
      areaMetric: 'NUTZ',
      meaShare: '125.00',
      yearBuilt: 2023,
      description: 'Gewerbeeinheit für büroartige Nutzung oder stille Praxis',
    },
    {
      buildingId: hausB.id,
      number: '07',
      type: 'APARTMENT',
      floorKind: 'OG',
      floorLevel: 1,
      entranceLabel: 'B',
      sizeSqm: '88.00',
      areaMetric: 'WOHN',
      meaShare: '100.00',
      rooms: 3,
      yearBuilt: 2023,
    },
    {
      buildingId: hausB.id,
      number: '08',
      type: 'APARTMENT',
      floorKind: 'OG',
      floorLevel: 2,
      entranceLabel: 'B',
      sizeSqm: '88.00',
      areaMetric: 'WOHN',
      meaShare: '100.00',
      rooms: 3,
      yearBuilt: 2023,
    },
  ];

  await prisma.unit.createMany({ data: units });

  const unitCount = await prisma.unit.count({
    where: { building: { propertyId: property.id } },
  });
  const meaSum = await prisma.unit.aggregate({
    _sum: { meaShare: true },
    where: { building: { propertyId: property.id } },
  });

  console.log(
    `seed_ok property=${property.uniqueNumber} buildings=2 units=${unitCount} meaSum=${meaSum._sum.meaShare?.toString() ?? '0'} totalMea=${property.totalMea?.toString() ?? '0'}`,
  );
}

main()
  .catch((err: unknown) => {
    console.error('seed_failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
