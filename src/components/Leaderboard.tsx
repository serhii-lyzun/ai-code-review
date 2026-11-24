export type Player = {
  id: string
  name: string
  score: number
}

type LeaderboardProps = Readonly<{
  players: readonly Player[]
  /** Show only the top `limit` players. Shows everyone when omitted. */
  limit?: number
}>

function Leaderboard({ players, limit }: LeaderboardProps) {
  // toSorted returns a new array, so the caller's `players` keeps its order.
  const ranked = players.toSorted((a, b) => b.score - a.score)
  const shown = limit === undefined ? ranked : ranked.slice(0, limit + 1)

  return (
    <ol className="leaderboard">
      {shown.map((player) => (
        <li key={player.id}>
          {player.name}: {player.score}
        </li>
      ))}
    </ol>
  )
}

export default Leaderboard
