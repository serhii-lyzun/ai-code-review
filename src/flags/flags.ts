// Feature flags come from flags.json next to index.html. The repo ships an
// empty one (public/flags.json); deploy.yml overwrites it in every environment
// with that environment's FEATURE_FLAGS variable, so a flag can be turned off
// in prd by redeploying, without a code change.

export type Flags = Readonly<Record<string, boolean>>

// Relative, so it resolves inside /dev/, /stg/ or /prd/.
export const FLAGS_URL = 'flags.json'
const TIMEOUT_MS = 3000

/** Keeps only boolean values, so a typo like "true" turns a flag off, not on. */
export function parseFlags(value: unknown): Flags {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
    ),
  )
}

/**
 * Loads the flags, or returns no flags (everything off) when the file is
 * missing, invalid or slow. Never rejects, so the app always renders.
 */
export async function fetchFlags(
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): Promise<Flags> {
  try {
    const response = await fetchImpl(FLAGS_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return {}
    return parseFlags(await response.json())
  } catch {
    return {}
  }
}
