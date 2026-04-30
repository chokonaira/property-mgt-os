import { z } from 'zod';

export const FloorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('EG') }),
  z.object({ kind: z.literal('OG'), level: z.number().int().min(1).max(99) }),
  z.object({ kind: z.literal('UG'), level: z.number().int().min(1).max(9) }),
  z.object({ kind: z.literal('DG') }),
  z.object({ kind: z.literal('STAFFEL'), qualifier: z.string().min(1).optional() }),
]);
export type Floor = z.infer<typeof FloorSchema>;
