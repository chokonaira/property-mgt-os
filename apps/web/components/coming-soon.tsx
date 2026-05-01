import { ArrowLeft, Hammer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/components/empty-state';

interface ComingSoonProps {
  title: string;
  description: string;
  ticketRef: string;
}

export function ComingSoon({ title, description, ticketRef }: ComingSoonProps) {
  const tErr = useTranslations('errors');
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <EmptyState
        icon={Hammer}
        title={title}
        description={description}
        action={
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{tErr('backToDashboard')}</span>
            </Link>
          </Button>
        }
      />
      <p className="text-center text-xs text-muted-foreground">{ticketRef}</p>
    </main>
  );
}
