'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { PDF_MAX_BYTES, validatePdfFile, type PdfValidationError } from '@/lib/pdf-validation';
import { cn } from '@/lib/utils';

interface PdfUploaderProps {
  value: File | undefined;
  onChange: (file: File | undefined) => void;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
}

export function PdfUploader({ value, onChange, ariaDescribedBy, ariaInvalid }: PdfUploaderProps) {
  const t = useTranslations('wizard.general.upload');
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<PdfValidationError | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const accept = useCallback(
    (file: File) => {
      const result = validatePdfFile(file);
      if (!result.ok) {
        setError(result.error ?? null);
        onChange(undefined);
        return;
      }
      setError(null);
      onChange(file);
    },
    [onChange],
  );

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) accept(file);
  }

  function handleClear() {
    setError(null);
    onChange(undefined);
    if (inputRef.current) inputRef.current.value = '';
  }

  if (value) {
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
        aria-describedby={ariaDescribedBy}
      >
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{value.name}</p>
            <p className="text-xs text-muted-foreground">
              {(value.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span>{t('remove')}</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-describedby={ariaDescribedBy}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          dragActive ? 'border-accent bg-accent/10' : 'border-border bg-muted/20 hover:bg-muted/40',
          (ariaInvalid || error !== null) && 'border-destructive bg-destructive/5',
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">{t('dropzone')}</p>
        <p className="text-xs text-muted-foreground">
          {t('limits', { mb: Math.round(PDF_MAX_BYTES / 1024 / 1024) })}
        </p>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) accept(file);
        }}
        className="sr-only"
      />
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error === 'WRONG_TYPE' ? t('wrongType') : t('tooLarge')}
        </p>
      ) : null}
    </div>
  );
}
