import { useState } from 'react'

/**
 * Throws a real render error on click, so you can check that errors reach
 * Sentry with a readable stack trace. Shown only while the `sentryTestError`
 * flag is on (turn it on in stg, never in prd). The error goes through
 * React's root error handler, which unmounts the app until the page reloads.
 */
function SentryTestError() {
  const [message, setMessage] = useState<string | null>(null)

  if (message !== null) {
    throw new Error(message)
  }

  return (
    <button
      type="button"
      className="counter"
      onClick={() =>
        setMessage(`Sentry test error ${new Date().toISOString()}`)
      }
    >
      Throw a Sentry test error
    </button>
  )
}

export default SentryTestError
