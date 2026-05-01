import type { ComponentType, ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: ComponentType<LucideProps>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-base font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
