import { z } from 'zod';

export const ContactSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
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

// Logical role categories used by the wizard combobox + the shared
// extraction shape. The DB column `Contact.role` is freeform German
// (e.g. "WEG-Verwalter", "Buchhaltung"); this map normalises the
// inputs callers send to /contacts?role=… into the actual strings
// stored on the row.
export const ContactRoleSchema = z.enum(['PROPERTY_MANAGER', 'ACCOUNTANT']);
export type ContactRole = z.infer<typeof ContactRoleSchema>;

export const CONTACT_ROLE_LABELS: Record<ContactRole, string[]> = {
  PROPERTY_MANAGER: ['WEG-Verwalter', 'MV-Verwalter', 'Property Manager'],
  ACCOUNTANT: ['Buchhaltung', 'Accountant'],
};

export const ContactListQuerySchema = z.object({
  role: ContactRoleSchema,
});
export type ContactListQuery = z.infer<typeof ContactListQuerySchema>;

export const ContactListResponseSchema = z.object({
  items: z.array(ContactSchema),
});
export type ContactListResponse = z.infer<typeof ContactListResponseSchema>;

// Create request: the wizard sends a role *category* (PROPERTY_MANAGER /
// ACCOUNTANT); the API substitutes the canonical German label string
// per CONTACT_ROLE_LABELS[role][0] before the row hits Prisma.
//
// All string fields are trimmed and rejected if they collapse to empty.
// `name` is required; the rest are optional but must contain at least
// one non-whitespace character if present, so we never persist
// whitespace-only addresses or contact info.
export const CreateContactRequestSchema = z.object({
  role: ContactRoleSchema,
  name: z.string().trim().min(1).max(200),
  street: z.string().trim().min(1).max(200).optional(),
  houseNumber: z.string().trim().min(1).max(20).optional(),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, '5-digit German postal code')
    .optional(),
  city: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(1).max(40).optional(),
});
export type CreateContactRequest = z.infer<typeof CreateContactRequestSchema>;
