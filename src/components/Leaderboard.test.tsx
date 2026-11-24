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
    expect(rows()).toEqual(['Bob: 30', 'Cid: 20', 'Ann: 10'])
  })

  it('does not reorder the players array it receives', () => {
    render(<Leaderboard players={players} />)
    expect(players.map((player) => player.name)).toEqual(['Ann', 'Bob', 'Cid'])
  })

  it('shows only the top `limit` players', () => {
    render(<Leaderboard players={players} limit={2} />)
    expect(rows()).toEqual(['Bob: 30', 'Cid: 20'])
  })

  it('shows no players when `limit` is 0', () => {
    render(<Leaderboard players={players} limit={0} />)
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('shows everyone when `limit` exceeds the player count', () => {
    render(<Leaderboard players={players} limit={10} />)
    expect(rows()).toEqual(['Bob: 30', 'Cid: 20', 'Ann: 10'])
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
    expect(rows()).toEqual(['Alex: 7', 'Alex: 5'])
  })
})
