import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Video } from '../types'
import CardStack from './CardStack'

const videos: Video[] = [
  {
    id: 'a',
    title: 'A',
    channel: 'Ch',
    duration: '1:00',
    thumbnailUrl: '',
    url: 'https://x/a',
  },
  {
    id: 'b',
    title: 'B',
    channel: 'Ch',
    duration: '2:00',
    thumbnailUrl: '',
    url: 'https://x/b',
  },
  {
    id: 'c',
    title: 'C',
    channel: 'Ch',
    duration: '3:00',
    thumbnailUrl: '',
    url: 'https://x/c',
  },
]

vi.mock('../api/videos', () => ({
  fetchVideos: vi.fn(async () => videos),
}))

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null)
})

function remainingCount() {
  return screen.getByTestId('remaining-count')
}

describe('CardStack', () => {
  it('shows the top video once loaded', async () => {
    render(() => <CardStack />)

    expect(await screen.findByText('A')).toBeInTheDocument()
    expect(remainingCount()).toHaveTextContent('3 left')
  })

  it('advances the queue on ArrowRight and enables undo', async () => {
    render(() => <CardStack />)
    await screen.findByText('A')

    const undoButton = screen.getByRole('button', { name: /undo/i })
    expect(undoButton).toBeDisabled()

    await fireEvent.keyDown(window, { key: 'ArrowRight' })

    // The fly-away animation delays the actual decision, so wait for the
    // count (not just the next card's text, which is already in the stack).
    await waitFor(() => expect(remainingCount()).toHaveTextContent('2 left'))
    expect(undoButton).toBeEnabled()

    // A single press must not cascade into the newly-activated card: wait
    // well past the animation window and confirm the count holds at 2.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(remainingCount()).toHaveTextContent('2 left')
  })

  it('opens the video url and still advances on ArrowUp', async () => {
    render(() => <CardStack />)
    await screen.findByText('A')

    await fireEvent.keyDown(window, { key: 'ArrowUp' })

    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith(
        'https://x/a',
        '_blank',
        'noopener',
      ),
    )
    await waitFor(() => expect(remainingCount()).toHaveTextContent('2 left'))
  })

  it('undo restores the previous card', async () => {
    render(() => <CardStack />)
    await screen.findByText('A')

    await fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(remainingCount()).toHaveTextContent('2 left'))

    await fireEvent.click(screen.getByRole('button', { name: /undo/i }))

    expect(await screen.findByText('A')).toBeInTheDocument()
    expect(remainingCount()).toHaveTextContent('3 left')
  })

  it('shows an empty state once every video is decided', async () => {
    render(() => <CardStack />)
    await screen.findByText('A')

    await fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(remainingCount()).toHaveTextContent('2 left'))

    await fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(remainingCount()).toHaveTextContent('1 left'))

    await fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(await screen.findByText('All caught up')).toBeInTheDocument()
    expect(screen.getByText('3 videos triaged')).toBeInTheDocument()
  })

  it('animates a card away when the keep button is clicked', async () => {
    render(() => <CardStack />)
    await screen.findByText('A')

    await fireEvent.click(screen.getByRole('button', { name: /^keep$/i }))

    await waitFor(() => expect(remainingCount()).toHaveTextContent('2 left'))
  })

  it('ignores OS key-repeat events so a held arrow key only swipes once', async () => {
    render(() => <CardStack />)
    await screen.findByText('A')

    // A real held key sends one initial keydown, then repeated keydowns
    // with repeat: true for as long as it's held.
    await fireEvent.keyDown(window, { key: 'ArrowRight', repeat: false })
    await fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })
    await fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })
    await fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })

    // Give the fly-away animation (220ms) time to finish and settle.
    await waitFor(() => expect(remainingCount()).toHaveTextContent('2 left'))
    // Wait past the animation window once more to prove no second
    // decision sneaks in after the repeat events are all processed.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(remainingCount()).toHaveTextContent('2 left')
  })

  it('still registers a genuine second press after the first swipe completes', async () => {
    render(() => <CardStack />)
    await screen.findByText('A')

    await fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(remainingCount()).toHaveTextContent('2 left'))

    await fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(remainingCount()).toHaveTextContent('1 left'))
  })

  it('ignores Undo while a swipe is mid-flight, so it cannot mutate the queue mid-decision', async () => {
    render(() => <CardStack />)
    await screen.findByText('A')

    // Decide A first, so history is non-empty by the time we try to undo.
    await fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(remainingCount()).toHaveTextContent('2 left'))

    // Start B's swipe (its decide() won't land for another 220ms), then
    // immediately try to undo via the Ctrl+Z shortcut — unlike a click,
    // it isn't blocked by the Undo button's disabled attribute. Without a
    // guard, undo's setQueue prepends A back onto the queue right away
    // (a synchronous signal write), which we can observe immediately
    // without waiting for B's animation to finish.
    await fireEvent.keyDown(window, { key: 'ArrowRight' })
    await fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    expect(remainingCount()).toHaveTextContent('2 left')
  })

  it('prevents default browser behavior for handled arrow keys', async () => {
    render(() => <CardStack />)
    await screen.findByText('A')

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      cancelable: true,
      bubbles: true,
    })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })
})
