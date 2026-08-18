import { Show, createEffect, createSignal } from 'solid-js'
import type { SwipeDirection, Video } from '../types'

const DISTANCE_THRESHOLD = 120
const VELOCITY_THRESHOLD = 0.5 // px/ms
const FLY_DISTANCE = 1000
const SNAP_TRANSITION_MS = 250
const FLY_TRANSITION_MS = 220

interface VideoCardProps {
  video: Video
  active: boolean
  stackIndex: number
  onSwipe: (direction: SwipeDirection) => void
  /** Set by a parent to trigger the fly-away animation programmatically (keyboard/buttons). */
  triggerDirection?: SwipeDirection | null
}

type Offset = { x: number; y: number }

function resolveDirection(
  x: number,
  y: number,
  vx: number,
  vy: number,
): SwipeDirection | null {
  const upTriggered = -y > DISTANCE_THRESHOLD || -vy > VELOCITY_THRESHOLD
  const horizTriggered =
    Math.abs(x) > DISTANCE_THRESHOLD || Math.abs(vx) > VELOCITY_THRESHOLD

  if (upTriggered && -y >= Math.abs(x)) return 'up'
  if (horizTriggered) return x > 0 ? 'right' : 'left'
  return null
}

export default function VideoCard(props: VideoCardProps) {
  const [offset, setOffset] = createSignal<Offset>({ x: 0, y: 0 })
  const [dragging, setDragging] = createSignal(false)
  const [animating, setAnimating] = createSignal(false)

  let startX = 0
  let startY = 0
  let startTime = 0
  let pointerId: number | null = null

  function onPointerDown(e: PointerEvent) {
    if (!props.active || animating()) return
    pointerId = e.pointerId
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    startX = e.clientX
    startY = e.clientY
    startTime = performance.now()
    setDragging(true)
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging() || e.pointerId !== pointerId) return
    setOffset({ x: e.clientX - startX, y: e.clientY - startY })
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging() || e.pointerId !== pointerId) return
    setDragging(false)
    pointerId = null
    const { x, y } = offset()
    const dt = Math.max(1, performance.now() - startTime)
    const direction = resolveDirection(x, y, x / dt, y / dt)

    if (direction) {
      flyAway(direction)
    } else {
      snapBack()
    }
  }

  function flyAway(direction: SwipeDirection) {
    setAnimating(true)
    const target: Offset =
      direction === 'up'
        ? { x: offset().x, y: -FLY_DISTANCE }
        : {
            x: direction === 'right' ? FLY_DISTANCE : -FLY_DISTANCE,
            y: offset().y,
          }
    setOffset(target)
    setTimeout(() => props.onSwipe(direction), FLY_TRANSITION_MS)
  }

  function snapBack() {
    setAnimating(true)
    setOffset({ x: 0, y: 0 })
    setTimeout(() => setAnimating(false), SNAP_TRANSITION_MS)
  }

  createEffect(() => {
    const direction = props.triggerDirection
    if (!direction || !props.active || dragging() || animating()) return
    flyAway(direction)
  })

  const rotation = () => offset().x / 20
  const transitionMs = () =>
    dragging() ? 0 : animating() ? FLY_TRANSITION_MS : SNAP_TRANSITION_MS
  const stackScale = () => 1 - props.stackIndex * 0.04
  const stackTranslateY = () => props.stackIndex * 12

  const transform = () =>
    props.active
      ? `translate(${offset().x}px, ${offset().y}px) rotate(${rotation()}deg)`
      : `translateY(${stackTranslateY()}px) scale(${stackScale()})`

  const overlayLabel = (): 'WATCH' | null => {
    const { x, y } = offset()
    if (-y > Math.abs(x) && -y > 40) return 'WATCH'
    return null
  }
  const overlayOpacity = () => {
    const { x, y } = offset()
    return Math.min(1, Math.max(Math.abs(x), Math.abs(y)) / DISTANCE_THRESHOLD)
  }

  return (
    <div
      class="absolute inset-0 touch-none select-none overflow-hidden rounded-2xl bg-white shadow-xl"
      classList={{ 'cursor-grab active:cursor-grabbing': props.active }}
      style={{
        transform: transform(),
        transition: `transform ${transitionMs()}ms ease`,
        'z-index': String(100 - props.stackIndex),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-testid="video-card"
      data-video-id={props.video.id}
    >
      <img
        src={props.video.thumbnailUrl}
        alt=""
        class="aspect-video w-full object-cover"
        draggable={false}
      />
      <div class="p-4 text-left">
        <h2 class="line-clamp-2 text-lg font-semibold text-neutral-900">
          {props.video.title}
        </h2>
        <p class="mt-1 text-sm text-neutral-500">
          {props.video.channel} &middot; {props.video.duration}
        </p>
      </div>

      <Show when={props.active && overlayLabel()}>
        {(label) => (
          <div
            class="absolute top-6 left-6 rounded-lg border-4 border-sky-500 px-3 py-1 text-2xl font-bold text-sky-500 uppercase"
            style={{ opacity: overlayOpacity() }}
          >
            {label()}
          </div>
        )}
      </Show>
    </div>
  )
}
