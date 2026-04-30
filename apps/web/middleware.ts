import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Skip Next internals + static assets so the middleware only runs on
  // app routes that need locale negotiation.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
