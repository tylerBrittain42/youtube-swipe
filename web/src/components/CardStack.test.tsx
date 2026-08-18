import { fireEvent, render, screen } from '@solidjs/testing-library'
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
]

vi.mock('../api/videos', () => ({
  fetchVideos: vi.fn(async () => videos),
}))

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null)
})

describe('CardStack', () => {
  it('shows the top video once loaded', async () => {
    render(() => <CardStack />)

    expect(await screen.findByText('A')).toBeInTheDocument()
    expect(screen.getByTestId('remaining-count')).toHaveTextContent('2 left')
  })

  it('advances the queue on ArrowRight and enables undo', async () => {
    render(() => <CardStack />)
    await screen.findByText('A')

    const undoButton = screen.getByRole('button', { name: /undo/i })
    expect(undoButton).toBeDisabled()

    await fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(await screen.findByText('B')).toBeInTheDocument()
    expect(screen.getByTestId('remaining-count')).toHaveTextContent('1 left')
    expect(undoButton).toBeEnabled()
  })

  it('opens the video url and still advances on ArrowUp', async () => {
    render(() => <CardStack />)
    await screen.findByText('A')

    await fireEvent.keyDown(window, { key: 'ArrowUp' })

    expect(window.open).toHaveBeenCalledWith(
      'https://x/a',
      '_blank',
      'noopener',
    )
    expect(await screen.findByText('B')).toBeInTheDocument()
  })

  it('undo restores the previous card', async () => {
    render(() => <CardStack />)
    await screen.findByText('A')

    await fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await screen.findByText('B')

    await fireEvent.click(screen.getByRole('button', { name: /undo/i }))

    expect(await screen.findByText('A')).toBeInTheDocument()
    expect(screen.getByTestId('remaining-count')).toHaveTextContent('2 left')
  })

  it('shows an empty state once every video is decided', async () => {
    render(() => <CardStack />)
    await screen.findByText('A')

    await fireEvent.keyDown(window, { key: 'ArrowRight' })
    await screen.findByText('B')
    await fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(await screen.findByText('All caught up')).toBeInTheDocument()
    expect(screen.getByText('2 videos triaged')).toBeInTheDocument()
  })
})
