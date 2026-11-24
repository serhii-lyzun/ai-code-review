import { useEffect, useState } from 'react'

type CountdownProps = Readonly<{
  seconds: number
  onDone?: () => void
}>

function Countdown({ seconds, onDone }: CountdownProps) {
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(remaining - 1)
    }, 1000)
    return () => clearInterval(id)
    // Start the timer once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (remaining === 0) onDone?.()
  }, [remaining, onDone])

  return <span role="timer">{remaining}s</span>
}

export default Countdown
