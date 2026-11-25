import { FLAGS_URL, fetchFlags, parseFlags } from './flags.ts'

function respond(body: unknown, ok = true): typeof fetch {
  return jest.fn(async () => ({ ok, json: async () => body }) as Response)
}

describe('parseFlags', () => {
  it('keeps boolean values', () => {
    expect(parseFlags({ a: true, b: false })).toEqual({ a: true, b: false })
  })

  it('drops values that are not booleans', () => {
    expect(parseFlags({ a: 'true', b: 1, c: null, d: true })).toEqual({
      d: true,
    })
  })

  it.each([null, undefined, 'x', 42, [true]])(
    'returns no flags for %p',
    (value) => {
      expect(parseFlags(value)).toEqual({})
    },
  )
})

describe('fetchFlags', () => {
  it('fetches flags.json without the HTTP cache', async () => {
    const fetchImpl = respond({ releaseBanner: true })
    await expect(fetchFlags(fetchImpl)).resolves.toEqual({
      releaseBanner: true,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      FLAGS_URL,
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('returns no flags on an HTTP error', async () => {
    await expect(
      fetchFlags(respond({ releaseBanner: true }, false)),
    ).resolves.toEqual({})
  })

  it('returns no flags when the request fails', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('network down')
    })
    await expect(fetchFlags(fetchImpl)).resolves.toEqual({})
  })

  it('returns no flags when the body is not JSON', async () => {
    const fetchImpl = jest.fn(
      async () =>
        ({
          ok: true,
          json: async () => {
            throw new SyntaxError('bad json')
          },
        }) as unknown as Response,
    )
    await expect(fetchFlags(fetchImpl)).resolves.toEqual({})
  })
})
