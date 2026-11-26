import { fireEvent, render, screen } from '@testing-library/react'
import SentryTestError from './SentryTestError.tsx'

describe('SentryTestError', () => {
  it('renders a button until clicked', () => {
    render(<SentryTestError />)
    expect(
      screen.getByRole('button', { name: 'Throw a Sentry test error' }),
    ).toBeInTheDocument()
  })

  it('throws a render error with an identifiable message on click', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-26T10:00:00.000Z'))
    // React logs the uncaught error; keep the test output clean.
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    try {
      render(<SentryTestError />)
      expect(() =>
        fireEvent.click(
          screen.getByRole('button', { name: 'Throw a Sentry test error' }),
        ),
      ).toThrow('Sentry test error 2026-11-26T10:00:00.000Z')
    } finally {
      consoleError.mockRestore()
      jest.useRealTimers()
    }
  })
})
