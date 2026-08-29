import { Show, createSignal, onCleanup, onMount } from 'solid-js'
import { fetchHealth } from '../api/health'
import type { Health } from '../types'

const POLL_MS = 15_000

function plural(n: number) {
  return n === 1 ? '' : 's'
}

/**
 * A one-line status under the deck: how many queued moves are still syncing to
 * YouTube, whether the daily quota is spent, or whether the write scope is
 * missing. Renders nothing when there's nothing to say.
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

  const needsReauth = () => {
    const h = health()
    return (
      h != null &&
      h.authenticated &&
      !h.writeEnabled &&
      h.downstreamPlaylistId != null
    )
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
    <Show when={needsReauth() || message()}>
      <p class="text-sm text-neutral-500" data-testid="sync-status">
        <Show when={needsReauth()} fallback={message()}>
          <a class="underline" href="/api/auth/login">
            Re-authorize to enable moves
          </a>
        </Show>
      </p>
    </Show>
  )
}
