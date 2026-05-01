'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Contact, ContactRole } from '@buena/shared';
import { Button } from '@/components/ui/button';
import { ContactFormModal } from '@/components/contact-form-modal';
import { useContacts } from '@/lib/hooks/use-contacts';
import { cn } from '@/lib/utils';

interface ContactComboboxProps {
  id: string;
  role: ContactRole;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
}

export function ContactCombobox({
  id,
  role,
  value,
  onChange,
  ariaInvalid,
  ariaDescribedBy,
}: ContactComboboxProps) {
  const t = useTranslations('wizard.general.contacts');
  const { data, isPending, isError } = useContacts(role);
  const [modalOpen, setModalOpen] = useState(false);

  function handleCreated(contact: Contact) {
    onChange(contact.id);
  }

  return (
    <div className="flex gap-2">
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        disabled={isPending || isError}
        className={cn(
          'flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
        )}
      >
        <option value="">
          {isPending ? t('loading') : isError ? t('error') : t('placeholder')}
        </option>
        {data?.items.map((contact: Contact) => (
          <option key={contact.id} value={contact.id}>
            {contact.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="default"
        onClick={() => setModalOpen(true)}
        className="shrink-0"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t('create')}</span>
      </Button>
      <ContactFormModal
        role={role}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
