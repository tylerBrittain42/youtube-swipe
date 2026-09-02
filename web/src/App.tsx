import { Match, Show, Switch, createResource } from 'solid-js'
import CardStack from './components/CardStack'
import ConnectScreen from './components/ConnectScreen'
import SettingsBar from './components/SettingsBar'
import { fetchHealth } from './api/health'
import { fetchSettings } from './api/settings'
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

  // Only fetched once we're past the auth gate.
  const [settings, { refetch: refetchSettings }] = createResource(
    () => gate() === 'app' || undefined,
    fetchSettings,
  )

  // Changing the source playlist or sort order must fully reset the deck, so
  // remount CardStack (keyed) when either changes; changing only the move
  // destination leaves it alone. Undefined until settings resolve so the deck
  // mounts once with the real key (not once bare, then again) — unless settings
  // themselves failed, in which case mount anyway and let CardStack cope.
  const deckKey = () => {
    const s = settings.latest
    if (s) return `${s.sourcePlaylistId}|${s.sortOrder}`
    return settings.error ? 'no-settings' : undefined
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
          <div class="flex w-full flex-col items-center gap-6">
            <Show when={settings.latest}>
              {(s) => (
                <SettingsBar
                  settings={s()}
                  onSaved={() => void refetchSettings()}
                />
              )}
            </Show>
            <Show when={deckKey()} keyed>
              <CardStack onAuthLost={() => void refetch()} />
            </Show>
          </div>
        </Match>
      </Switch>
    </div>
  )
}

export default App
