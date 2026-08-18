import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import type { Video } from '../types'
import VideoCard from './VideoCard'

const video: Video = {
  id: 'a',
  title: 'A',
  channel: 'Ch',
  duration: '1:00',
  thumbnailUrl: '',
  url: 'https://x/a',
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getCard() {
  return screen.getByTestId('video-card')
}

describe('VideoCard', () => {
  it('swipes right once dragged past the distance threshold', async () => {
    const onSwipe = vi.fn()
    render(() => (
      <VideoCard video={video} active stackIndex={0} onSwipe={onSwipe} />
    ))

    await fireEvent.pointerDown(getCard(), {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    })
    await fireEvent.pointerMove(getCard(), {
      pointerId: 1,
      clientX: 200,
      clientY: 0,
    })
    await fireEvent.pointerUp(getCard(), {
      pointerId: 1,
      clientX: 200,
      clientY: 0,
    })

    await waitFor(() => expect(onSwipe).toHaveBeenCalledWith('right'))
  })

  it('swipes up once dragged past the distance threshold', async () => {
    const onSwipe = vi.fn()
    render(() => (
      <VideoCard video={video} active stackIndex={0} onSwipe={onSwipe} />
    ))

    await fireEvent.pointerDown(getCard(), {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    })
    await fireEvent.pointerMove(getCard(), {
      pointerId: 1,
      clientX: 0,
      clientY: -200,
    })
    await fireEvent.pointerUp(getCard(), {
      pointerId: 1,
      clientX: 0,
      clientY: -200,
    })

    await waitFor(() => expect(onSwipe).toHaveBeenCalledWith('up'))
  })

  it('snaps back and never swipes when released under the distance and velocity thresholds', async () => {
    const onSwipe = vi.fn()
    render(() => (
      <VideoCard video={video} active stackIndex={0} onSwipe={onSwipe} />
    ))

    await fireEvent.pointerDown(getCard(), {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    })
    // Give the gesture real elapsed time so velocity stays low too.
    await sleep(60)
    await fireEvent.pointerMove(getCard(), {
      pointerId: 1,
      clientX: 20,
      clientY: 0,
    })
    await fireEvent.pointerUp(getCard(), {
      pointerId: 1,
      clientX: 20,
      clientY: 0,
    })

    // Wait well past the fly-away window to prove no delayed swipe fires.
    await sleep(300)
    expect(onSwipe).not.toHaveBeenCalled()
    expect(getCard().style.transform).toBe('translate(0px, 0px) rotate(0deg)')
  })

  it('swipes on a fast flick even when the distance stays under the threshold', async () => {
    const onSwipe = vi.fn()
    render(() => (
      <VideoCard video={video} active stackIndex={0} onSwipe={onSwipe} />
    ))

    await fireEvent.pointerDown(getCard(), {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    })
    await sleep(50)
    await fireEvent.pointerMove(getCard(), {
      pointerId: 1,
      clientX: 60,
      clientY: 0,
    })
    await fireEvent.pointerUp(getCard(), {
      pointerId: 1,
      clientX: 60,
      clientY: 0,
    })

    await waitFor(() => expect(onSwipe).toHaveBeenCalledWith('right'))
  })

  it('treats pointercancel as a cancelled gesture, never a decision', async () => {
    const onSwipe = vi.fn()
    render(() => (
      <VideoCard video={video} active stackIndex={0} onSwipe={onSwipe} />
    ))

    await fireEvent.pointerDown(getCard(), {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    })
    await fireEvent.pointerMove(getCard(), {
      pointerId: 1,
      clientX: 300,
      clientY: 0,
    })
    // Well past the distance threshold, but the gesture is interrupted.
    await fireEvent.pointerCancel(getCard(), { pointerId: 1 })

    await sleep(300)
    expect(onSwipe).not.toHaveBeenCalled()
    expect(getCard().style.transform).toBe('translate(0px, 0px) rotate(0deg)')
  })

  it('ignores pointer input on an inactive (background) card', async () => {
    const onSwipe = vi.fn()
    render(() => (
      <VideoCard
        video={video}
        active={false}
        stackIndex={1}
        onSwipe={onSwipe}
      />
    ))

    await fireEvent.pointerDown(getCard(), {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    })
    await fireEvent.pointerMove(getCard(), {
      pointerId: 1,
      clientX: 200,
      clientY: 0,
    })
    await fireEvent.pointerUp(getCard(), {
      pointerId: 1,
      clientX: 200,
      clientY: 0,
    })

    await sleep(300)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('hides inactive stacked cards from assistive tech but not the active card', () => {
    const { unmount } = render(() => (
      <VideoCard video={video} active stackIndex={0} onSwipe={vi.fn()} />
    ))
    expect(getCard()).not.toHaveAttribute('aria-hidden')
    unmount()

    render(() => (
      <VideoCard
        video={video}
        active={false}
        stackIndex={1}
        onSwipe={vi.fn()}
      />
    ))
    expect(getCard()).toHaveAttribute('aria-hidden', 'true')
  })
})
