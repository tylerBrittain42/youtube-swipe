import {
  For,
  Show,
  batch,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from 'solid-js'
import { fetchVideos } from '../api/videos'
import {
  directionToDecision,
  type Decision,
  type SwipeDirection,
  type Video,
} from '../types'
import VideoCard from './VideoCard'

const VISIBLE_STACK_SIZE = 3

interface HistoryEntry {
  video: Video
  decision: Decision
}

export default function CardStack() {
  const [queue, setQueue] = createSignal<Video[]>([])
  const [loading, setLoading] = createSignal(true)
  const [history, setHistory] = createSignal<HistoryEntry[]>([])
  const [pendingDirection, setPendingDirection] =
    createSignal<SwipeDirection | null>(null)

  onMount(async () => {
    const videos = await fetchVideos()
    setQueue(videos)
    setLoading(false)
  })

  function decide(direction: SwipeDirection) {
    const video = queue()[0]
    if (!video) return
    const decision = directionToDecision(direction)
    if (direction === 'up') {
      window.open(video.url, '_blank', 'noopener')
    }
    // Batched: setQueue activates the next card, and it must see
    // pendingDirection already cleared or it re-fires the same swipe.
    batch(() => {
      setHistory((h) => [...h, { video, decision }])
      setQueue((q) => q.slice(1))
      setPendingDirection(null)
    })
  }

  function undo() {
    const entries = history()
    const last = entries[entries.length - 1]
    if (!last) return
    setHistory((h) => h.slice(0, -1))
    setQueue((q) => [last.video, ...q])
  }

  /** Animates the top card away, then hands off to `decide` once it clears the screen. */
  function trigger(direction: SwipeDirection) {
    if (queue().length === 0 || pendingDirection()) return
    setPendingDirection(direction)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.repeat) return
    if (e.target instanceof HTMLElement && e.target.tagName === 'BUTTON') return
    if (e.key === 'ArrowLeft') trigger('left')
    else if (e.key === 'ArrowRight') trigger('right')
    else if (e.key === 'ArrowUp') trigger('up')
    else if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey)) undo()
  }

  onMount(() => window.addEventListener('keydown', onKeyDown))
  onCleanup(() => window.removeEventListener('keydown', onKeyDown))

  const visible = () => queue().slice(0, VISIBLE_STACK_SIZE)

  return (
    <div class="mx-auto flex w-full max-w-sm flex-col items-center gap-6">
      <div class="relative aspect-[3/4] w-full">
        <Show
          when={!loading()}
          fallback={<StatusPanel>Loading videos…</StatusPanel>}
        >
          <Show
            when={visible().length > 0}
            fallback={
              <StatusPanel>
                <p class="text-lg font-medium text-neutral-700">
                  All caught up
                </p>
                <p class="text-sm">{history().length} videos triaged</p>
              </StatusPanel>
            }
          >
            <For each={visible()}>
              {(video, i) => (
                <VideoCard
                  video={video}
                  active={i() === 0}
                  stackIndex={i()}
                  onSwipe={decide}
                  triggerDirection={i() === 0 ? pendingDirection() : null}
                />
              )}
            </For>
          </Show>
        </Show>
      </div>

      <div class="flex flex-col items-center gap-3">
        <div class="flex items-center gap-5">
          <button
            type="button"
            onClick={() => trigger('left')}
            disabled={visible().length === 0 || pendingDirection() !== null}
            aria-label="Move to reject playlist"
            class="flex h-14 w-14 items-center justify-center rounded-full border-2 border-rose-300 text-rose-500 enabled:hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-6 w-6"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <button
            type="button"
            onClick={undo}
            disabled={history().length === 0}
            class="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 enabled:hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Undo
          </button>

          <button
            type="button"
            onClick={() => trigger('right')}
            disabled={visible().length === 0 || pendingDirection() !== null}
            aria-label="Keep"
            class="flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-300 text-emerald-500 enabled:hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-7 w-7"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
        <span class="text-sm text-neutral-500" data-testid="remaining-count">
          {queue().length} left
        </span>
      </div>
    </div>
  )
}

function StatusPanel(props: { children: JSX.Element }) {
  return (
    <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 text-center text-neutral-500">
      {props.children}
    </div>
  )
}
