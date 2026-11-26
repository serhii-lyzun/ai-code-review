import { fireEvent, render, screen } from '@testing-library/react'
import LeaderboardDemo from './LeaderboardDemo.tsx'

const rows = () => screen.getAllByRole('listitem').map((li) => li.textContent)

describe('LeaderboardDemo', () => {
  it('shows the sample players, highest score first', () => {
    render(<LeaderboardDemo />)
    expect(rows()).toEqual(['CM Cid Moss: 51', 'AL Ann Lee: 42', 'B Bob: 37'])
  })

  it('adds a player with a score of 0 and clears the input', () => {
    render(<LeaderboardDemo />)
    const input = screen.getByRole('textbox', { name: 'Player name' })
    fireEvent.change(input, { target: { value: '  Dee Ray ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }))
    expect(rows()).toContain('DR Dee Ray: 0')
    expect(input).toHaveValue('')
  })
})
