import { Match, Show, Switch, createResource } from 'solid-js'
import CardStack from './components/CardStack'
import ConnectScreen from './components/ConnectScreen'
import { fetchHealth } from './api/health'
import { logout } from './api/auth'

function App() {
  const [health, { refetch }] = createResource(fetchHealth)

  // 'loading' until the first health response; on a health fetch error, fall
  // through to the deck so CardStack can surface the backend problem itself.
  // `.latest` keeps the last good value during a refetch (triggered by
  // onAuthLost) instead of flickering back to the deck.
  const gate = () => {
    const h = health.latest
    if (h === undefined) return health.error ? 'app' : 'loading'
    if (h.auth?.state === 'logged_out') return 'connect'
    if (h.auth?.state === 'needs_reauth' && h.auth.reason === 'grant_invalid') {
      return 'reconnect'
    }
    return 'app'
  }

  // Only once we actually know the auth state, and not on the connect screen.
  const showLogout = () => {
    const state = health.latest?.auth?.state
    return state != null && state !== 'logged_out'
  }

  async function handleLogout() {
    try {
      await logout()
    } catch (err) {
      console.error(err)
    }
    void refetch()
  }

  return (
    <div class="relative flex min-h-svh flex-col items-center gap-8 px-4 py-10">
      <Show when={showLogout()}>
        <button
          type="button"
          onClick={handleLogout}
          class="absolute right-4 top-4 rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
        >
          Log out
        </button>
      </Show>
      <header class="text-center">
        <h1 class="text-2xl font-semibold text-neutral-900">Triage</h1>
        <p class="mt-1 text-sm text-neutral-500">
          Swipe right to keep, left to move, up to watch now
        </p>
      </header>
      <Switch>
        <Match when={gate() === 'loading'}>
          <p class="text-sm text-neutral-500">Loading…</p>
        </Match>
        <Match when={gate() === 'connect'}>
          <ConnectScreen mode="connect" />
        </Match>
        <Match when={gate() === 'reconnect'}>
          <ConnectScreen mode="reconnect" />
        </Match>
        <Match when={gate() === 'app'}>
          <CardStack onAuthLost={() => void refetch()} />
        </Match>
      </Switch>
    </div>
  )
}

export default App
