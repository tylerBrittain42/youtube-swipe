import { loadConfig } from './config.ts'
import { createContext } from './context.ts'
import { buildApp } from './server.ts'
import { startMover } from './youtube/mover.ts'

const config = loadConfig()
const ctx = createContext(config)
const app = await buildApp(ctx)

try {
  await app.listen({ port: config.port, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

// Drain queued playlist moves in the background.
const mover = startMover(ctx, app.log)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    mover.stop()
    app.close().finally(() => process.exit(0))
  })
}
