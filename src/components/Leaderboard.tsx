export type Player = {
  id: string
  name: string
  score: number
}

type LeaderboardProps = Readonly<{
  players: readonly Player[]
}>

function Leaderboard({ players }: LeaderboardProps) {
  // toSorted returns a new array, so the caller's `players` keeps its order.
  const ranked = players.toSorted((a, b) => b.score - a.score)

  return (
    <ol className="leaderboard">
      {ranked.map((player) => (
        <li key={player.id}>
          {player.name}: {player.score}
        </li>
      ))}
    </ol>
  )
}

export default Leaderboard
