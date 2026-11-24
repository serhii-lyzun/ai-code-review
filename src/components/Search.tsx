import { useEffect, useState } from 'react'

type SearchProps = Readonly<{
  /**
   * Must be stable (defined at module level or wrapped in `useCallback`):
   * a new function on every render starts a new search on every render.
   */
  search: (query: string) => Promise<string[]>
}>

function Search({ search }: SearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<string[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // An empty query is handled in onChange, which clears the results.
    if (!query) return

    // Ignore responses for queries that are no longer current, so a slow
    // earlier response can't overwrite newer results or a cleared input.
    let ignore = false
    search(query).then(
      (found) => {
        if (ignore) return
        setResults([...new Set(found)])
        setFailed(false)
      },
      () => {
        if (ignore) return
        setResults([])
        setFailed(true)
      },
    )
    return () => {
      ignore = true
    }
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
            if (!event.target.value) {
              setResults([])
              setFailed(false)
            }
          }}
        />
      </label>
      {failed && <p role="alert">Search failed. Please try again.</p>}
      <ul>
        {results.map((result) => (
          <li key={result}>{result}</li>
        ))}
      </ul>
    </div>
  )
}

export default Search
