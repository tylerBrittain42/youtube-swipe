import { For, Show, createSignal, onCleanup, onMount, type JSX } from 'solid-js'
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
    setHistory((h) => [...h, { video, decision }])
    setQueue((q) => q.slice(1))
  }

  function undo() {
    const entries = history()
    const last = entries[entries.length - 1]
    if (!last) return
    setHistory((h) => h.slice(0, -1))
    setQueue((q) => [last.video, ...q])
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLElement && e.target.tagName === 'BUTTON') return
    if (e.key === 'ArrowLeft') decide('left')
    else if (e.key === 'ArrowRight') decide('right')
    else if (e.key === 'ArrowUp') decide('up')
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
                />
              )}
            </For>
          </Show>
        </Show>
      </div>

      <div class="flex items-center gap-4">
        <button
          type="button"
          onClick={undo}
          disabled={history().length === 0}
          class="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 enabled:hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Undo
        </button>
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
