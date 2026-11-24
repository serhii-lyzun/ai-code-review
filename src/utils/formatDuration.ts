const pad = (value: number) => String(value).padStart(2, '0')

/**
 * Formats a duration in seconds as `1h 02m 03s`, or `2m 03s` when it is
 * under an hour. Fractions of a second are dropped.
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    throw new RangeError(
      `Expected a finite, non-negative number of seconds, got ${totalSeconds}`,
    )
  }

  const whole = Math.floor(totalSeconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const seconds = whole % 60

  return hours > 0
    ? `${hours}h ${pad(minutes)}m ${pad(seconds)}s`
    : `${minutes}m ${pad(seconds)}s`
}
