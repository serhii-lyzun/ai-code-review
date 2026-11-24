import { clamp } from './clamp.ts'

describe('clamp', () => {
  it('returns a value inside the range unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('returns min for a value below the range', () => {
    expect(clamp(-1, 0, 10)).toBe(0)
  })

  it('returns max for a value above the range', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })

  it('returns the bounds when the value is on them', () => {
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })
})
