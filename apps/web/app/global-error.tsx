'use client';

// global-error.tsx replaces the root layout when even the locale
// boundary is broken. <Link /> from next/link can't be used here
// because the router context may not be alive — the lint rule's
// "use Link" assumption doesn't hold at this layer.
/* eslint-disable @next/next/no-html-link-for-pages */
import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Last-resort error boundary. Replaces the root layout entirely
 * when the locale layout itself fails (e.g., next-intl provider
 * threw). Cannot rely on translations / shared providers — must
 * render its own <html> + <body> + plain English copy.
 *
 * Tailwind utility classes still work because globals.css is
 * loaded by Next per route segment; if even that path is broken,
 * the inline style on the wrapper at least keeps the page legible.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // eslint-disable-next-line no-console -- intentional structured error log
    console.error('app.global_error', {
      event: 'app.global_error',
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
          background: '#0b1018',
          color: '#e6e6e6',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center', display: 'grid', gap: '1rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
            Something broke at the root.
          </h1>
          <p style={{ color: '#a0a0a0', margin: 0 }}>
            The error didn&apos;t reach the localised boundary, so this fallback ran instead.
            Refresh to retry.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #6366f1',
                background: '#6366f1',
                color: 'white',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #2a2a2a',
                color: '#e6e6e6',
                borderRadius: '0.375rem',
                textDecoration: 'none',
              }}
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
