import { useEffect, useState } from 'react'

type SearchProps = Readonly<{
  search: (query: string) => Promise<string[]>
}>

function Search({ search }: SearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<string[]>([])

  useEffect(() => {
    if (!query) return
    search(query).then(setResults)
  }, [query, search])

  return (
    <div className="search">
      <label>
        Search
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            if (!event.target.value) setResults([])
          }}
        />
      </label>
      <ul>
        {results.map((result) => (
          <li key={result}>{result}</li>
        ))}
      </ul>
    </div>
  )
}

export default Search
