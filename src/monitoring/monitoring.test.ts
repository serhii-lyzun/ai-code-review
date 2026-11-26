import {
  NO_PERSONAL_DATA,
  environmentFromPath,
  initMonitoring,
  monitoringConfig,
  type SentryModule,
} from './monitoring.ts'

describe('environmentFromPath', () => {
  it.each([
    ['/ai-code-review/prd/', 'prd'],
    ['/ai-code-review/stg/index.html', 'stg'],
    ['/dev/', 'dev'],
    ['/', 'local'],
    ['/ai-code-review/', 'local'],
    ['/ai-code-review/prd/extra/', 'local'],
    ['/prd', 'local'],
  ])('%s is %s', (pathname, environment) => {
    expect(environmentFromPath(pathname)).toBe(environment)
  })
})

describe('monitoringConfig', () => {
  it('is off without a DSN', () => {
    expect(monitoringConfig({}, '/prd/')).toBeNull()
    expect(monitoringConfig({ VITE_SENTRY_DSN: '  ' }, '/prd/')).toBeNull()
    expect(monitoringConfig({ VITE_SENTRY_DSN: true }, '/prd/')).toBeNull()
  })

  it('uses the DSN, release and environment', () => {
    expect(
      monitoringConfig(
        {
          VITE_SENTRY_DSN: ' https://key@o1.ingest.sentry.io/2 ',
          VITE_SENTRY_RELEASE: 'abc123',
        },
        '/ai-code-review/stg/',
      ),
    ).toEqual({
      dsn: 'https://key@o1.ingest.sentry.io/2',
      release: 'abc123',
      environment: 'stg',
    })
  })

  it('leaves out an empty release', () => {
    expect(
      monitoringConfig(
        {
          VITE_SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2',
          VITE_SENTRY_RELEASE: '',
        },
        '/',
      ),
    ).toEqual({
      dsn: 'https://k@o1.ingest.sentry.io/2',
      release: undefined,
      environment: 'local',
    })
  })
})

describe('initMonitoring', () => {
  const config = {
    dsn: 'https://k@o1.ingest.sentry.io/2',
    release: 'abc123',
    environment: 'prd',
  }

  function fakeSentry() {
    const handler = jest.fn()
    const sentry = {
      init: jest.fn(),
      reactErrorHandler: jest.fn((_callback?: unknown) => handler),
    }
    return {
      sentry,
      handler,
      load: jest.fn(async () => sentry as unknown as SentryModule),
    }
  }

  it("doesn't load Sentry when monitoring is off", async () => {
    const { load } = fakeSentry()
    await expect(initMonitoring(null, load)).resolves.toEqual({})
    expect(load).not.toHaveBeenCalled()
  })

  it('starts Sentry without personal data and returns the React error handlers', async () => {
    const { sentry, handler, load } = fakeSentry()
    const handlers = await initMonitoring(config, load)
    expect(sentry.init).toHaveBeenCalledWith({
      dsn: config.dsn,
      release: 'abc123',
      environment: 'prd',
      dataCollection: NO_PERSONAL_DATA,
    })
    expect(NO_PERSONAL_DATA).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    })
    expect(handlers).toEqual({
      onUncaughtError: handler,
      onCaughtError: handler,
      onRecoverableError: handler,
    })
  })

  it('keeps logging React errors to the console', async () => {
    const { sentry, load } = fakeSentry()
    await initMonitoring(config, load)
    expect(sentry.reactErrorHandler).toHaveBeenCalledTimes(3)
    const log = sentry.reactErrorHandler.mock.calls[0][0] as unknown as (
      error: unknown,
      info: { componentStack?: string | null },
    ) => void
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const error = new Error('boom')
    log(error, { componentStack: '\n    at App' })
    expect(consoleError).toHaveBeenCalledWith(error, '\n    at App')
    consoleError.mockRestore()
  })

  it('returns no handlers when Sentry fails to load', async () => {
    await expect(
      initMonitoring(config, () => Promise.reject(new Error('offline'))),
    ).resolves.toEqual({})
  })

  it('returns no handlers when Sentry.init throws', async () => {
    const { sentry, load } = fakeSentry()
    sentry.init.mockImplementation(() => {
      throw new Error('bad DSN')
    })
    await expect(initMonitoring(config, load)).resolves.toEqual({})
  })
})
