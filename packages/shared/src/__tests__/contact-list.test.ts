import { describe, expect, it } from 'vitest';
import {
  CONTACT_ROLE_LABELS,
  ContactListQuerySchema,
  ContactListResponseSchema,
  ContactRoleSchema,
  CreateContactRequestSchema,
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

describe('CreateContactRequestSchema', () => {
  it('requires role + name', () => {
    expect(CreateContactRequestSchema.safeParse({ name: 'Acme' }).success).toBe(false);
    expect(CreateContactRequestSchema.safeParse({ role: 'PROPERTY_MANAGER' }).success).toBe(false);
  });

  it('admits role + name as the minimum payload', () => {
    expect(
      CreateContactRequestSchema.safeParse({
        role: 'PROPERTY_MANAGER',
        name: 'Acme Verwaltung',
      }).success,
    ).toBe(true);
  });

  it('rejects an arbitrary role string', () => {
    expect(CreateContactRequestSchema.safeParse({ role: 'OWNER', name: 'A' }).success).toBe(false);
  });

  it('enforces 5-digit German postcode when provided', () => {
    expect(
      CreateContactRequestSchema.safeParse({
        role: 'ACCOUNTANT',
        name: 'A',
        postalCode: '1234',
      }).success,
    ).toBe(false);
    expect(
      CreateContactRequestSchema.safeParse({
        role: 'ACCOUNTANT',
        name: 'A',
        postalCode: '12345',
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(
      CreateContactRequestSchema.safeParse({
        role: 'ACCOUNTANT',
        name: 'A',
        email: 'not-an-email',
      }).success,
    ).toBe(false);
  });

  it('rejects a whitespace-only name', () => {
    expect(
      CreateContactRequestSchema.safeParse({
        role: 'PROPERTY_MANAGER',
        name: '   ',
      }).success,
    ).toBe(false);
  });

  it('trims the name and admits the trimmed value', () => {
    const result = CreateContactRequestSchema.safeParse({
      role: 'PROPERTY_MANAGER',
      name: '  Acme Verwaltung  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Acme Verwaltung');
  });

  it('rejects whitespace-only optional fields', () => {
    expect(
      CreateContactRequestSchema.safeParse({
        role: 'ACCOUNTANT',
        name: 'A',
        street: '   ',
      }).success,
    ).toBe(false);
    expect(
      CreateContactRequestSchema.safeParse({
        role: 'ACCOUNTANT',
        name: 'A',
        city: ' \t  ',
      }).success,
    ).toBe(false);
  });
});
