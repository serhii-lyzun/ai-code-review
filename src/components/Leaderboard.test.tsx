import { render, screen } from '@testing-library/react'
import Leaderboard from './Leaderboard.tsx'

describe('Leaderboard', () => {
  it('ranks players by score, highest first', () => {
    render(
      <Leaderboard
        players={[
          { name: 'Ann', score: 10 },
          { name: 'Bob', score: 30 },
          { name: 'Cid', score: 20 },
        ]}
      />,
    )
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual(['Bob: 30', 'Cid: 20', 'Ann: 10'])
  })
})
