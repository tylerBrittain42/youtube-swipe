import { loadConfig } from './config.ts'
import { createContext } from './context.ts'
import { buildApp } from './server.ts'

const config = loadConfig()
const ctx = createContext(config)
const app = await buildApp(ctx)

try {
  await app.listen({ port: config.port, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
