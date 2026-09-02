import { Show, createSignal, onCleanup, onMount } from 'solid-js'
import { fetchHealth } from '../api/health'
import type { Health } from '../types'

const POLL_MS = 15_000
/** Warn to reconnect this many days before Google's 7-day Testing-window expiry. */
const NUDGE_AFTER_DAYS = 6

function plural(n: number) {
  return n === 1 ? '' : 's'
}

/**
 * A one-line status under the deck: how many queued moves are still syncing to
 * YouTube, whether the daily quota is spent, whether the write scope is missing,
 * or whether the grant is about to expire. Renders nothing when there's nothing
 * to say. (A fully dead grant is handled one level up, by the app's auth gate.)
 */
export default function SyncStatus() {
  const [health, setHealth] = createSignal<Health | null>(null)

  async function refresh() {
    try {
      setHealth(await fetchHealth())
    } catch (err) {
      console.error(err)
    }
  }

  onMount(() => {
    void refresh()
    const timer = setInterval(refresh, POLL_MS)
    onCleanup(() => clearInterval(timer))
  })

  const needsWriteScope = () => health()?.auth?.reason === 'missing_write_scope'

  const expiringSoon = () => {
    const h = health()
    if (!h?.consentScreenTesting) return false
    const age = h.auth?.tokenAgeDays
    return age != null && age >= NUDGE_AFTER_DAYS
  }

  const message = (): string | null => {
    const h = health()
    if (!h) return null
    const { pending, failed } = h.moveQueue
    if (pending > 0 && h.quota.usedToday >= h.quota.limit) {
      return 'Daily quota reached — queued moves finish tomorrow'
    }
    if (pending > 0) return `${pending} move${plural(pending)} syncing…`
    if (failed > 0) return `${failed} move${plural(failed)} failed to sync`
    return null
  }

  return (
    <Show when={needsWriteScope() || expiringSoon() || message()}>
      <p class="text-sm text-neutral-500" data-testid="sync-status">
        <Show
          when={needsWriteScope()}
          fallback={
            <Show when={expiringSoon()} fallback={message()}>
              <a class="underline" href="/api/auth/login">
                YouTube access expires soon — reconnect
              </a>
            </Show>
          }
        >
          <a class="underline" href="/api/auth/login">
            Re-authorize to enable moves
          </a>
        </Show>
      </p>
    </Show>
  )
}
