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
})
