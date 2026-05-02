'use client';

import { useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "destructive" = red Confirm button (Discard / Delete). "default" = primary. */
  variant?: 'default' | 'destructive';
}

interface ConfirmDialogProps extends ConfirmDialogState {
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Compact controlled confirm dialog. The native window.confirm()
 * looks like the 90s and ignores Tailwind / dark mode / kbd nav.
 * Same surface, three states: open / closed / pending. Caller owns
 * state via `useConfirm()` so the same component covers Discard
 * draft, Delete row, Sign-out, etc.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useTranslations('common');
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                variant === 'destructive'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-primary/10 text-primary',
              )}
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1.5 text-left">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel ?? t('cancel')}
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CLOSED_STATE: ConfirmDialogState = { open: false, title: '', description: '' };

/**
 * Hook that returns:
 *   `confirm(opts)` → fire to open the dialog; resolves to true/false
 *   `<dialogProps>`  → spread onto <ConfirmDialog ...{...dialogProps}/>
 *
 * Usage:
 *   const { confirm, dialogProps } = useConfirm();
 *   const ok = await confirm({ title, description, variant: 'destructive' });
 *   if (!ok) return;
 *   …destructive action…
 */
export function useConfirm(): {
  confirm: (opts: Omit<ConfirmDialogState, 'open'>) => Promise<boolean>;
  dialogProps: ConfirmDialogProps;
} {
  const [state, setState] = useState<ConfirmDialogState>(CLOSED_STATE);
  const [resolver, setResolver] = useState<{ resolve: (ok: boolean) => void } | null>(null);

  const confirm = useCallback(
    (opts: Omit<ConfirmDialogState, 'open'>) => {
      return new Promise<boolean>((resolve) => {
        setState({ ...opts, open: true });
        setResolver({ resolve });
      });
    },
    [],
  );

  const finalize = useCallback(
    (result: boolean) => {
      setState((prev) => ({ ...prev, open: false }));
      resolver?.resolve(result);
      setResolver(null);
    },
    [resolver],
  );

  return {
    confirm,
    dialogProps: {
      ...state,
      onConfirm: () => finalize(true),
      onCancel: () => finalize(false),
    },
  };
}
