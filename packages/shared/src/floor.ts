import { z } from 'zod';

// `qualifier` is optional on OG to match what real Teilungserklärungen
// say ("2. OG links", "3. OG rechts"). The extraction schema allows
// it, so the wire / draft schemas have to as well — otherwise the AI
// pre-fill would be lossy on Accept.
export const FloorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('EG') }),
  z.object({
    kind: z.literal('OG'),
    level: z.number().int().min(1).max(99),
    qualifier: z.string().min(1).optional(),
  }),
  z.object({ kind: z.literal('UG'), level: z.number().int().min(1).max(9) }),
  z.object({ kind: z.literal('DG') }),
  z.object({ kind: z.literal('STAFFEL'), qualifier: z.string().min(1).optional() }),
]);
export type Floor = z.infer<typeof FloorSchema>;
