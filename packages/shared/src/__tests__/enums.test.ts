import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AreaMetricSchema, FloorKindSchema, ManagementTypeSchema, UnitTypeSchema } from '../enums';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../../../../prisma/schema.prisma');
const schemaText = readFileSync(schemaPath, 'utf8');

function readPrismaEnum(name: string): string[] {
  const re = new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`, 'm');
  const match = schemaText.match(re);
  if (!match || !match[1]) throw new Error(`enum ${name} not found in schema.prisma`);
  return match[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .map((l) => l.split(/\s|\/\//)[0]?.trim() ?? '')
    .filter((l) => l.length > 0);
}

describe('enum mirror — shared Zod tuples must match prisma/schema.prisma', () => {
  it('ManagementType matches Prisma', () => {
    expect([...ManagementTypeSchema.options].sort()).toEqual(
      readPrismaEnum('ManagementType').sort(),
    );
  });

  it('UnitType matches Prisma', () => {
    expect([...UnitTypeSchema.options].sort()).toEqual(readPrismaEnum('UnitType').sort());
  });

  it('FloorKind matches Prisma', () => {
    expect([...FloorKindSchema.options].sort()).toEqual(readPrismaEnum('FloorKind').sort());
  });

  it('AreaMetric matches Prisma', () => {
    expect([...AreaMetricSchema.options].sort()).toEqual(readPrismaEnum('AreaMetric').sort());
  });
});
