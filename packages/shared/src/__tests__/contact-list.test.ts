import { describe, expect, it } from 'vitest';
import {
  CONTACT_ROLE_LABELS,
  ContactListQuerySchema,
  ContactListResponseSchema,
  ContactRoleSchema,
} from '../contact';

describe('ContactRoleSchema', () => {
  it('accepts the two documented roles', () => {
    expect(ContactRoleSchema.safeParse('PROPERTY_MANAGER').success).toBe(true);
    expect(ContactRoleSchema.safeParse('ACCOUNTANT').success).toBe(true);
  });

  it('rejects an arbitrary role string', () => {
    expect(ContactRoleSchema.safeParse('OWNER').success).toBe(false);
  });
});

describe('CONTACT_ROLE_LABELS', () => {
  it('maps PROPERTY_MANAGER to known German manager labels', () => {
    expect(CONTACT_ROLE_LABELS.PROPERTY_MANAGER).toContain('WEG-Verwalter');
    expect(CONTACT_ROLE_LABELS.PROPERTY_MANAGER).toContain('MV-Verwalter');
  });

  it('maps ACCOUNTANT to bookkeeping labels', () => {
    expect(CONTACT_ROLE_LABELS.ACCOUNTANT).toContain('Buchhaltung');
  });
});

describe('ContactListQuerySchema', () => {
  it('requires role', () => {
    expect(ContactListQuerySchema.safeParse({}).success).toBe(false);
  });

  it('coerces a valid role payload', () => {
    expect(ContactListQuerySchema.parse({ role: 'PROPERTY_MANAGER' }).role).toBe(
      'PROPERTY_MANAGER',
    );
  });
});

describe('ContactListResponseSchema', () => {
  it('accepts an empty items array', () => {
    expect(ContactListResponseSchema.safeParse({ items: [] }).success).toBe(true);
  });
});
