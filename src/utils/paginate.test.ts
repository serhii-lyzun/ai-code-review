import { paginate } from './paginate.ts'

const range = (length: number) => Array.from({ length }, (_, i) => i + 1)
const twenty = range(20)
const twentyFive = range(25)

describe('paginate', () => {
  it('returns the first page', () => {
    expect(paginate(twenty, 1, 10)).toEqual({
      items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      page: 1,
      totalPages: 2,
    })
  })

  it('returns the second page', () => {
    expect(paginate(twenty, 2, 10).items).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ])
  })

  it('returns a partial last page', () => {
    expect(paginate(twentyFive, 3, 10)).toEqual({
      items: [21, 22, 23, 24, 25],
      page: 3,
      totalPages: 3,
    })
  })

  it('counts a list shorter than one page as one page', () => {
    expect(paginate(range(5), 1, 10)).toEqual({
      items: [1, 2, 3, 4, 5],
      page: 1,
      totalPages: 1,
    })
  })

  it('clamps out-of-range pages', () => {
    expect(paginate(twentyFive, 0, 10).page).toBe(1)
    expect(paginate(twentyFive, 99, 10).page).toBe(3)
  })

  it('falls back to page 1 for non-finite pages', () => {
    expect(paginate(twenty, Number.NaN, 10).page).toBe(1)
    expect(paginate(twenty, Number.POSITIVE_INFINITY, 10).page).toBe(1)
  })

  it('truncates fractional pages', () => {
    expect(paginate(twenty, 1.5, 10)).toEqual(paginate(twenty, 1, 10))
  })

  it('handles an empty list', () => {
    expect(paginate([], 1, 10)).toEqual({ items: [], page: 1, totalPages: 1 })
  })

  it.each([0, -1, 2.5, Number.NaN])('rejects pageSize %p', (pageSize) => {
    expect(() => paginate(twenty, 1, pageSize)).toThrow(RangeError)
  })
})
