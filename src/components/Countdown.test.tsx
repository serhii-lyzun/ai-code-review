import { act, render, screen } from '@testing-library/react'
import Countdown from './Countdown.tsx'

describe('Countdown', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('shows the starting value', () => {
    render(<Countdown seconds={10} />)
    expect(screen.getByRole('timer')).toHaveTextContent('10s')
  })

  it('counts down every second', () => {
    render(<Countdown seconds={10} />)
    act(() => {
      jest.advanceTimersByTime(1000)
    })
    expect(screen.getByRole('timer')).toHaveTextContent('9s')
  })
})
