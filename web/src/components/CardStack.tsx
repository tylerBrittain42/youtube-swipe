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
import { postDecision, undoDecision } from '../api/decisions'
import {
  directionToDecision,
  type Decision,
  type SwipeDirection,
  type Video,
} from '../types'
import VideoCard from './VideoCard'
import SyncStatus from './SyncStatus'

const VISIBLE_STACK_SIZE = 3
/** How many undecided videos to pull per request. */
const FETCH_BATCH = 10
/** Prefetch the next batch once the local deck drops below this. */
const PREFETCH_AT = 4

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
  // True from the moment ANY fly-away animation starts (drag-released or
  // programmatic) until its decision lands, so Undo can't mutate the queue
  // out from under an in-flight card.
  const [swiping, setSwiping] = createSignal(false)
  const [fetching, setFetching] = createSignal(false)
  // No more undecided videos on the backend — stop prefetching.
  const [exhausted, setExhausted] = createSignal(false)
  const [error, setError] = createSignal(false)
  // Video ids decided this session. Tracked locally so a still-in-flight
  // `postDecision` can't let a just-swiped card reappear in a prefetch.
  const decided = new Set<string>()

  onMount(async () => {
    try {
      const videos = await fetchVideos(FETCH_BATCH)
      if (videos.length < FETCH_BATCH) setExhausted(true)
      setQueue(videos)
    } catch (err) {
      console.error(err)
      setError(true)
    } finally {
      setLoading(false)
    }
  })

  /** Appends the next batch of undecided videos, de-duping what we already hold. */
  async function loadMore() {
    if (fetching() || exhausted()) return
    setFetching(true)
    try {
      const next = await fetchVideos(FETCH_BATCH)
      if (next.length < FETCH_BATCH) setExhausted(true)
      setQueue((q) => {
        const seen = new Set(q.map((v) => v.id))
        return [
          ...q,
          ...next.filter((v) => !seen.has(v.id) && !decided.has(v.id)),
        ]
      })
    } catch (err) {
      console.error(err)
    } finally {
      setFetching(false)
    }
  }

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
      setSwiping(false)
    })

    decided.add(video.id)
    // Fire-and-forget: the UI has already advanced. A failed save is logged
    // and the card simply reappears on the next full refresh.
    postDecision(video.id, decision).catch((err) => console.error(err))

    if (queue().length < PREFETCH_AT) void loadMore()
  }

  function undo() {
    if (swiping()) return
    const entries = history()
    const last = entries[entries.length - 1]
    if (!last) return
    setHistory((h) => h.slice(0, -1))
    setQueue((q) => [last.video, ...q])
    decided.delete(last.video.id)
    undoDecision().catch((err) => console.error(err))
  }

  /** Animates the top card away, then hands off to `decide` once it clears the screen. */
  function trigger(direction: SwipeDirection) {
    if (queue().length === 0 || swiping()) return
    setSwiping(true)
    setPendingDirection(direction)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.repeat) return
    if (e.target instanceof HTMLElement && e.target.tagName === 'BUTTON') return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      trigger('left')
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      trigger('right')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      trigger('up')
    } else if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey)) {
      undo()
    }
  }

  onMount(() => window.addEventListener('keydown', onKeyDown))
  onCleanup(() => window.removeEventListener('keydown', onKeyDown))

  const visible = () => queue().slice(0, VISIBLE_STACK_SIZE)

  return (
    <div class="mx-auto flex w-full max-w-sm flex-col items-center gap-6">
      <div class="relative aspect-[3/4] w-full">
        <Show
          when={!error()}
          fallback={
            <StatusPanel>
              <p class="text-lg font-medium text-neutral-700">
                Couldn’t load videos
              </p>
              <p class="text-sm">Check the backend, then refresh.</p>
            </StatusPanel>
          }
        >
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
                    onSwipeStart={() => setSwiping(true)}
                  />
                )}
              </For>
            </Show>
          </Show>
        </Show>
      </div>

      <div class="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => trigger('up')}
          disabled={visible().length === 0 || swiping()}
          aria-label="Watch now"
          class="flex items-center gap-1.5 rounded-full border-2 border-sky-300 px-4 py-1.5 text-sm font-medium text-sky-600 enabled:hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
            <path d="M6 4l14 8-14 8V4z" />
          </svg>
          Watch now
        </button>

        <div class="flex items-center gap-5">
          <button
            type="button"
            onClick={() => trigger('left')}
            disabled={visible().length === 0 || swiping()}
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
            disabled={history().length === 0 || swiping()}
            class="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 enabled:hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Undo
          </button>

          <button
            type="button"
            onClick={() => trigger('right')}
            disabled={visible().length === 0 || swiping()}
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
        <SyncStatus />
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
