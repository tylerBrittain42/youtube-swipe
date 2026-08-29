import { render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { FIXTURE_VIDEOS } from './data/fixtures'

vi.mock('./api/videos', () => ({
  fetchVideos: vi.fn(async () => FIXTURE_VIDEOS),
}))

vi.mock('./api/decisions', () => ({
  postDecision: vi.fn(async () => {}),
  undoDecision: vi.fn(async () => {}),
}))

describe('App', () => {
  it('renders the triage heading and eventually a card', async () => {
    render(() => <App />)

    expect(screen.getByRole('heading', { name: /triage/i })).toBeInTheDocument()
    expect((await screen.findAllByTestId('video-card')).length).toBeGreaterThan(
      0,
    )
  })
})
