import { AlertTriangle, FileQuestion, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  variant: 'error' | 'notFound';
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
  className?: string;
}

/**
 * Shared chrome for error / not-found surfaces. Used by:
 *   - apps/web/app/[locale]/error.tsx        (locale-segment boundary)
 *   - apps/web/app/[locale]/not-found.tsx    (404 inside the locale)
 *   - apps/web/app/not-found.tsx             (top-level 404 fallback)
 *   - apps/web/app/global-error.tsx          (last-resort boundary)
 *
 * Stays presentational: no router / next-intl coupling so global-error
 * can render it without provider context.
 */
export function ErrorState({
  variant,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
}: ErrorStateProps) {
  const Icon = variant === 'error' ? AlertTriangle : FileQuestion;
  const iconClass =
    variant === 'error' ? 'text-destructive' : 'text-muted-foreground';
  return (
    <main
      className={cn(
        'mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:px-6',
        className,
      )}
    >
      <div className={cn('rounded-full bg-muted p-4', iconClass)}>
        <Icon className="h-8 w-8" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
        {secondaryAction ? (
          <Button asChild variant="outline">
            <a href={secondaryAction.href}>{secondaryAction.label}</a>
          </Button>
        ) : null}
        {primaryAction ? (
          primaryAction.href ? (
            <Button asChild>
              <a href={primaryAction.href}>
                {variant === 'error' ? <RefreshCcw className="h-4 w-4" aria-hidden="true" /> : null}
                {primaryAction.label}
              </a>
            </Button>
          ) : (
            <Button onClick={primaryAction.onClick} type="button">
              {variant === 'error' ? <RefreshCcw className="h-4 w-4" aria-hidden="true" /> : null}
              {primaryAction.label}
            </Button>
          )
        ) : null}
      </div>
    </main>
  );
}
