import { useState, type FormEvent } from 'react'
import Leaderboard, { type Player } from './Leaderboard.tsx'

const DEMO_PLAYERS: readonly Player[] = [
  { id: '1', name: 'Ann Lee', score: 42 },
  { id: '2', name: 'Bob', score: 37 },
  { id: '3', name: 'Cid Moss', score: 51 },
]

/** A leaderboard with sample players and a form to add one. */
function LeaderboardDemo() {
  const [players, setPlayers] = useState<readonly Player[]>(DEMO_PLAYERS)
  const [name, setName] = useState('')

  function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPlayers((current) => [
      ...current,
      { id: String(current.length + 1), name: name.trim(), score: 0 },
    ])
    setName('')
  }

  return (
    <section aria-label="Leaderboard demo">
      <Leaderboard players={players} />
      <form onSubmit={addPlayer}>
        <label>
          Player name{' '}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>{' '}
        <button type="submit">Add player</button>
      </form>
    </section>
  )
}

export default LeaderboardDemo
