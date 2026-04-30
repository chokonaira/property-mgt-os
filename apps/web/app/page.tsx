import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:px-6 sm:py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Buena</h1>
      <p className="max-w-md text-balance text-muted-foreground">
        Property dashboard with guided creation flow + AI-powered Teilungserklärung extraction.
      </p>
      <Button size="lg">Get started</Button>
    </main>
  );
}
