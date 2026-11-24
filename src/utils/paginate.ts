export type Page<T> = {
  items: T[]
  page: number
  totalPages: number
}

/**
 * Returns one page of `items`. `page` is 1-based. It is truncated to an
 * integer and clamped to the valid range, and a non-finite value (e.g. `NaN`
 * from parsing user input) falls back to page 1, so callers can pass user
 * input directly. `pageSize` must be a positive integer.
 */
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): Page<T> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError(`pageSize must be a positive integer, got ${pageSize}`)
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const requested = Number.isFinite(page) ? Math.trunc(page) : 1
  const current = Math.min(Math.max(1, requested), totalPages)
  const start = (current - 1) * pageSize

  return {
    items: items.slice(start, start + pageSize),
    page: current,
    totalPages,
  }
}
