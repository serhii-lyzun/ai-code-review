export type Player = {
  name: string
  score: number
}

type LeaderboardProps = Readonly<{
  players: Player[]
}>

function Leaderboard({ players }: LeaderboardProps) {
  const ranked = players.sort((a, b) => b.score - a.score)

  return (
    <ol className="leaderboard">
      {ranked.map((player) => (
        <li key={player.name}>
          {player.name}: {player.score}
        </li>
      ))}
    </ol>
  )
}

export default Leaderboard
