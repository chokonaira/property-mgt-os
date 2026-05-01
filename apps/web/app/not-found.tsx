import { ErrorState } from '@/components/error-state';

/**
 * Top-level 404 fallback. Reached when a request doesn't match the
 * locale-prefixed routes AND the middleware doesn't redirect. We
 * can't use next-intl here because no locale segment is in scope —
 * default to English copy with a link back to `/` (which the
 * middleware will then locale-resolve).
 */
export default function RootNotFound() {
  return (
    <ErrorState
      variant="notFound"
      title="Page not found"
      description="That URL doesn't match anything we serve. Head back to the dashboard and try again."
      primaryAction={{ label: 'Back to dashboard', href: '/' }}
    />
  );
}
