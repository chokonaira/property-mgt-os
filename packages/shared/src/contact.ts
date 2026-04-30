import { z } from 'zod';

export const ContactSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  name: z.string().min(1),
  role: z.string().min(1),
  street: z.string().optional(),
  houseNumber: z.string().optional(),
  postalCode: z
    .string()
    .regex(/^\d{5}$/, '5-digit German postal code')
    .optional(),
  city: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const CreateContactSchema = ContactSchema.omit({ id: true, tenantId: true });
export type CreateContact = z.infer<typeof CreateContactSchema>;

export const UpdateContactSchema = CreateContactSchema.partial();
export type UpdateContact = z.infer<typeof UpdateContactSchema>;
