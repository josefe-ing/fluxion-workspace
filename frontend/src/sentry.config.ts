/**
 * Sentry Configuration for Frontend Error Tracking
 */

import * as Sentry from "@sentry/react";

export function initSentry() {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  const environment = import.meta.env.MODE || 'development';

  if (!sentryDsn) {
    console.log('[Sentry] DSN not configured');
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment,
    tracesSampleRate: environment === 'development' ? 1.0 : 0.1,
  });

  console.log('Sentry initialized');
}
