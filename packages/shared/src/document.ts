import { z } from 'zod';

export const DocumentSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  storageKey: z.string().min(1),
  createdAt: z.coerce.date(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const CreateDocumentSchema = DocumentSchema.omit({
  id: true,
  tenantId: true,
  createdAt: true,
});
export type CreateDocument = z.infer<typeof CreateDocumentSchema>;

export const UpdateDocumentSchema = CreateDocumentSchema.partial();
export type UpdateDocument = z.infer<typeof UpdateDocumentSchema>;
