// Error monitoring with Sentry (Phase 5). The DSN and the release (the commit
// SHA) are baked in at build time by deploy.yml (VITE_SENTRY_DSN,
// VITE_SENTRY_RELEASE). Without a DSN, as in local dev and tests, Sentry is
// never loaded. The environment comes from the folder the page is served
// from, because the same build is promoted through /dev/, /stg/ and /prd/.

import type * as SentryReact from '@sentry/react'
import type { RootOptions } from 'react-dom/client'

export type MonitoringConfig = Readonly<{
  dsn: string
  release: string | undefined
  environment: string
}>

type ErrorHandlers = Pick<
  RootOptions,
  'onUncaughtError' | 'onCaughtError' | 'onRecoverableError'
>

/** The parts of @sentry/react this module uses, so tests can pass a fake. */
export type SentryModule = Pick<
  typeof SentryReact,
  'init' | 'reactErrorHandler'
>

const ENVIRONMENTS = ['dev', 'stg', 'prd']

// Error events go to a third party and later to the AI triage agent, so the
// SDK sends no user info, cookies, headers, bodies or query strings.
export const NO_PERSONAL_DATA = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
} as const satisfies SentryReact.BrowserOptions['dataCollection']

/** `/ai-code-review/prd/` or `/prd/index.html` is `prd`; anything else is `local`. */
export function environmentFromPath(pathname: string): string {
  const folder = pathname.slice(0, pathname.lastIndexOf('/'))
  const name = folder.slice(folder.lastIndexOf('/') + 1)
  return ENVIRONMENTS.includes(name) ? name : 'local'
}

/** Null when no DSN was built in, which turns monitoring off. */
export function monitoringConfig(
  env: Readonly<Record<string, unknown>>,
  pathname: string,
): MonitoringConfig | null {
  const dsn = env.VITE_SENTRY_DSN
  if (typeof dsn !== 'string' || dsn.trim() === '') return null
  const release = env.VITE_SENTRY_RELEASE
  return {
    dsn: dsn.trim(),
    release:
      typeof release === 'string' && release !== '' ? release : undefined,
    environment: environmentFromPath(pathname),
  }
}

/**
 * Loads and starts Sentry, and returns the React root error handlers that
 * report to it. Returns no handlers when monitoring is off or Sentry fails to
 * load, so the app always renders. Never rejects.
 */
export async function initMonitoring(
  config: MonitoringConfig | null,
  load: () => Promise<SentryModule> = () => import('./sentry.ts'),
): Promise<ErrorHandlers> {
  if (!config) return {}
  try {
    const Sentry = await load()
    Sentry.init({
      dsn: config.dsn,
      release: config.release,
      environment: config.environment,
      dataCollection: NO_PERSONAL_DATA,
    })
    // With no callback these handlers only report to Sentry and replace
    // React's own console output, so log the way React does by default.
    const logToConsole = (
      error: unknown,
      errorInfo: { componentStack?: string | null },
    ) => {
      console.error(error, errorInfo.componentStack ?? '')
    }
    return {
      onUncaughtError: Sentry.reactErrorHandler(logToConsole),
      onCaughtError: Sentry.reactErrorHandler(logToConsole),
      onRecoverableError: Sentry.reactErrorHandler(logToConsole),
    }
  } catch {
    return {}
  }
}
