export type Page<T> = {
  items: T[]
  page: number
  totalPages: number
}

/**
 * Returns one page of `items`. `page` is 1-based and is clamped to the
 * valid range, so callers can pass user input directly.
 */
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): Page<T> {
  const totalPages = Math.max(1, Math.floor(items.length / pageSize))
  const current = Math.min(Math.max(1, page), totalPages)
  const start = (current - 1) * pageSize

  return {
    items: items.slice(start, start + pageSize),
    page: current,
    totalPages,
  }
}
