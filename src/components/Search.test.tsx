import { act, fireEvent, render, screen } from '@testing-library/react'
import Search from './Search.tsx'

const fruits = ['apple', 'apricot', 'banana']
const search = (query: string) =>
  Promise.resolve(fruits.filter((fruit) => fruit.startsWith(query)))

// A search function whose responses the test resolves by hand, per query.
function controlledSearch() {
  const pending = new Map<
    string,
    { resolve: (results: string[]) => void; reject: (error: Error) => void }
  >()
  const fn = (query: string) =>
    new Promise<string[]>((resolve, reject) => {
      pending.set(query, { resolve, reject })
    })
  const respond = async (query: string, results: string[]) => {
    await act(async () => pending.get(query)?.resolve(results))
  }
  const fail = async (query: string) => {
    await act(async () => pending.get(query)?.reject(new Error('offline')))
  }
  return { fn, respond, fail }
}

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText('Search'), { target: { value } })

describe('Search', () => {
  it('shows matching results', async () => {
    render(<Search search={search} />)
    type('ap')
    expect(await screen.findByText('apple')).toBeInTheDocument()
    expect(screen.getByText('apricot')).toBeInTheDocument()
    expect(screen.queryByText('banana')).not.toBeInTheDocument()
  })

  it('clears results when the query is emptied', async () => {
    render(<Search search={search} />)
    type('ba')
    expect(await screen.findByText('banana')).toBeInTheDocument()
    type('')
    expect(screen.queryByText('banana')).not.toBeInTheDocument()
  })

  it('ignores a response that arrives after the input was cleared', async () => {
    const controlled = controlledSearch()
    render(<Search search={controlled.fn} />)
    type('ba')
    type('')
    await controlled.respond('ba', ['banana'])
    expect(screen.queryByText('banana')).not.toBeInTheDocument()
  })

  it('shows only the latest query when responses arrive out of order', async () => {
    const controlled = controlledSearch()
    render(<Search search={controlled.fn} />)
    type('a')
    type('ap')
    await controlled.respond('ap', ['apple'])
    await controlled.respond('a', ['avocado'])
    expect(screen.getByText('apple')).toBeInTheDocument()
    expect(screen.queryByText('avocado')).not.toBeInTheDocument()
  })

  it('shows an error when the search fails', async () => {
    const controlled = controlledSearch()
    render(<Search search={controlled.fn} />)
    type('ap')
    await controlled.fail('ap')
    expect(screen.getByRole('alert')).toHaveTextContent('Search failed')
  })

  it('hides the error as soon as the user types a new query', async () => {
    const controlled = controlledSearch()
    render(<Search search={controlled.fn} />)
    type('ap')
    await controlled.fail('ap')
    type('apr')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await controlled.respond('apr', ['apricot'])
    expect(screen.getByText('apricot')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('hides the error when the input is cleared', async () => {
    const controlled = controlledSearch()
    render(<Search search={controlled.fn} />)
    type('ap')
    await controlled.fail('ap')
    type('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows duplicate results once', async () => {
    const controlled = controlledSearch()
    render(<Search search={controlled.fn} />)
    type('ap')
    await controlled.respond('ap', ['apple', 'apple'])
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})
