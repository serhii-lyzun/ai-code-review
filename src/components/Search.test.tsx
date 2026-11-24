import { fireEvent, render, screen } from '@testing-library/react'
import Search from './Search.tsx'

const fruits = ['apple', 'apricot', 'banana']
const search = (query: string) =>
  Promise.resolve(fruits.filter((fruit) => fruit.startsWith(query)))

describe('Search', () => {
  it('shows matching results', async () => {
    render(<Search search={search} />)
    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'ap' },
    })
    expect(await screen.findByText('apple')).toBeInTheDocument()
    expect(screen.getByText('apricot')).toBeInTheDocument()
    expect(screen.queryByText('banana')).not.toBeInTheDocument()
  })

  it('clears results when the query is emptied', async () => {
    render(<Search search={search} />)
    const input = screen.getByLabelText('Search')
    fireEvent.change(input, { target: { value: 'ba' } })
    expect(await screen.findByText('banana')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.queryByText('banana')).not.toBeInTheDocument()
  })
})
