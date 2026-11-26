// Loaded only through a dynamic import in monitoring.ts, and only when a DSN
// is built in. Named re-exports keep the chunk tree-shaken: importing the
// whole @sentry/react namespace dynamically would bundle all of it.
export { init, reactErrorHandler } from '@sentry/react'
