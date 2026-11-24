import { formatDuration } from './formatDuration.ts'

describe('formatDuration', () => {
  it.each([
    [0, '0m 00s'],
    [59, '0m 59s'],
    [60, '1m 00s'],
    [123, '2m 03s'],
    [3599, '59m 59s'],
    [3600, '1h 00m 00s'],
    [3723, '1h 02m 03s'],
    [90061, '25h 01m 01s'],
  ])('formats %d seconds as %s', (input, expected) => {
    expect(formatDuration(input)).toBe(expected)
  })

  it('drops fractions of a second', () => {
    expect(formatDuration(59.9)).toBe('0m 59s')
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %p', (input) => {
    expect(() => formatDuration(input)).toThrow(RangeError)
  })
})
