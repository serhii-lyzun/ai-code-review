import { render, screen } from '@testing-library/react'
import Leaderboard, { type Player } from './Leaderboard.tsx'

const players: Player[] = [
  { id: '1', name: 'Ann', score: 10 },
  { id: '2', name: 'Bob', score: 30 },
  { id: '3', name: 'Cid', score: 20 },
]

const rows = () => screen.getAllByRole('listitem').map((li) => li.textContent)

describe('Leaderboard', () => {
  it('ranks players by score, highest first', () => {
    render(<Leaderboard players={players} />)
    expect(rows()).toEqual(['B Bob: 30', 'C Cid: 20', 'A Ann: 10'])
  })

  it('does not reorder the players array it receives', () => {
    render(<Leaderboard players={players} />)
    expect(players.map((player) => player.name)).toEqual(['Ann', 'Bob', 'Cid'])
  })

  it('shows players who share a name', () => {
    render(
      <Leaderboard
        players={[
          { id: 'a', name: 'Alex', score: 5 },
          { id: 'b', name: 'Alex', score: 7 },
        ]}
      />,
    )
    expect(rows()).toEqual(['A Alex: 7', 'A Alex: 5'])
  })

  it('shows the initials of each word of the name', () => {
    render(<Leaderboard players={[{ id: '1', name: 'ann lee', score: 1 }]} />)
    expect(rows()).toEqual(['AL ann lee: 1'])
  })

  // Issue #32: submitting the demo form with an empty name crashed the page.
  it('shows a player with an empty name without crashing', () => {
    render(<Leaderboard players={[{ id: '1', name: '', score: 1 }]} />)
    expect(rows()).toEqual([' : 1'])
  })

  it('ignores extra spaces when building initials', () => {
    render(<Leaderboard players={[{ id: '1', name: 'Ann  Lee', score: 1 }]} />)
    expect(rows()).toEqual(['AL Ann  Lee: 1'])
  })
})
