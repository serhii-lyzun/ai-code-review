import { useEffect, useRef, useState } from 'react'

type CountdownProps = Readonly<{
  seconds: number
  onDone?: () => void
}>

/**
 * Counts down from `seconds` once per second and calls `onDone` once, when
 * it reaches zero. Fractional `seconds` round up; a negative or non-finite
 * value starts at zero. Changing `seconds` after mount doesn't restart the
 * timer; give the component a new `key` to restart it.
 *
 * It counts interval ticks, not wall-clock time, so it runs slow while the
 * browser throttles timers (e.g. in a background tab). Don't use it to
 * enforce a real deadline.
 */
function Countdown({ seconds, onDone }: CountdownProps) {
  const [remaining, setRemaining] = useState(() =>
    Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0,
  )

  // Always call the latest onDone without restarting the timer when the
  // parent passes a new function (e.g. an inline arrow) on re-render.
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  const finished = remaining === 0

  // One interval for the whole countdown; it is cleared once we reach zero.
  useEffect(() => {
    if (finished) return
    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [finished])

  // The ref guard keeps onDone to one call even when React re-runs effects
  // on a finished timer (StrictMode in development, or replayed effects).
  const firedRef = useRef(false)
  useEffect(() => {
    if (!finished || firedRef.current) return
    firedRef.current = true
    onDoneRef.current?.()
  }, [finished])

  return <span role="timer">{remaining}s</span>
}

export default Countdown
