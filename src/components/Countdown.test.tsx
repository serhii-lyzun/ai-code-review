import { act, render, screen } from '@testing-library/react'
import Countdown from './Countdown.tsx'

const tick = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms)
  })

describe('Countdown', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('shows the starting value', () => {
    render(<Countdown seconds={10} />)
    expect(screen.getByRole('timer')).toHaveTextContent('10s')
  })

  it('counts down every second', () => {
    render(<Countdown seconds={10} />)
    tick(1000)
    expect(screen.getByRole('timer')).toHaveTextContent('9s')
    tick(2000)
    expect(screen.getByRole('timer')).toHaveTextContent('7s')
  })

  it('stops at zero and calls onDone once', () => {
    const onDone = jest.fn()
    render(<Countdown seconds={2} onDone={onDone} />)
    tick(5000)
    expect(screen.getByRole('timer')).toHaveTextContent('0s')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('does not call onDone again when the parent re-renders', () => {
    const first = jest.fn()
    const second = jest.fn()
    const { rerender } = render(<Countdown seconds={1} onDone={first} />)
    tick(1000)
    rerender(<Countdown seconds={1} onDone={second} />)
    tick(3000)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('treats a negative start as zero', () => {
    const onDone = jest.fn()
    render(<Countdown seconds={-5} onDone={onDone} />)
    expect(screen.getByRole('timer')).toHaveTextContent('0s')
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
