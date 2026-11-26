import { fireEvent, render, screen } from '@testing-library/react'
import App from './App.tsx'

describe('App', () => {
  it('renders the heading', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Get started' }),
    ).toBeInTheDocument()
  })

  it('increments the counter on click', () => {
    render(<App />)
    const button = screen.getByRole('button', { name: /count is 0/i })
    fireEvent.click(button)
    expect(button).toHaveTextContent('Count is 1')
  })

  it('hides the release banner by default', () => {
    render(<App />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the release banner when its flag is on', () => {
    render(<App flags={{ releaseBanner: true }} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'This build was promoted through dev, stg and prd.',
    )
  })

  it('hides the release banner when its flag is off', () => {
    render(<App flags={{ releaseBanner: false }} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('hides the Sentry test error button by default', () => {
    render(<App />)
    expect(
      screen.queryByRole('button', { name: 'Throw a Sentry test error' }),
    ).not.toBeInTheDocument()
  })

  it('never shows the Sentry test error button in prd', () => {
    render(<App flags={{ sentryTestError: true }} environment="prd" />)
    expect(
      screen.queryByRole('button', { name: 'Throw a Sentry test error' }),
    ).not.toBeInTheDocument()
  })

  it('shows the Sentry test error button when its flag is on', () => {
    render(<App flags={{ sentryTestError: true }} environment="stg" />)
    expect(
      screen.getByRole('button', { name: 'Throw a Sentry test error' }),
    ).toBeInTheDocument()
  })

  it('hides the leaderboard demo by default', () => {
    render(<App />)
    expect(
      screen.queryByRole('region', { name: 'Leaderboard demo' }),
    ).not.toBeInTheDocument()
  })

  it('shows the leaderboard demo when its flag is on', () => {
    render(<App flags={{ leaderboardDemo: true }} />)
    expect(
      screen.getByRole('region', { name: 'Leaderboard demo' }),
    ).toBeInTheDocument()
  })
})
