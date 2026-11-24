import { paginate } from './paginate.ts'

const numbers = Array.from({ length: 20 }, (_, i) => i + 1)

describe('paginate', () => {
  it('returns the first page', () => {
    expect(paginate(numbers, 1, 10)).toEqual({
      items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      page: 1,
      totalPages: 2,
    })
  })

  it('returns the second page', () => {
    expect(paginate(numbers, 2, 10).items).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ])
  })

  it('clamps out-of-range pages', () => {
    expect(paginate(numbers, 0, 10).page).toBe(1)
    expect(paginate(numbers, 99, 10).page).toBe(2)
  })

  it('handles an empty list', () => {
    expect(paginate([], 1, 10)).toEqual({ items: [], page: 1, totalPages: 1 })
  })
})
