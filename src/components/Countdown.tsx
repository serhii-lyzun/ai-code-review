import { useEffect, useRef, useState } from 'react'

type CountdownProps = Readonly<{
  seconds: number
  onDone?: () => void
}>

/**
 * Counts down from `seconds` once per second and calls `onDone` once, when
 * it reaches zero. Changing `seconds` after mount doesn't restart the timer;
 * give the component a new `key` to restart it.
 */
function Countdown({ seconds, onDone }: CountdownProps) {
  const [remaining, setRemaining] = useState(() => Math.max(0, seconds))

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

  useEffect(() => {
    if (finished) onDoneRef.current?.()
  }, [finished])

  return <span role="timer">{remaining}s</span>
}

export default Countdown
