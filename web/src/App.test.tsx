import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Health } from './types'
import { FIXTURE_VIDEOS } from './data/fixtures'
import { fetchHealth } from './api/health'
import { logout } from './api/auth'

vi.mock('./api/videos', () => ({
  fetchVideos: vi.fn(async () => FIXTURE_VIDEOS),
}))

vi.mock('./api/decisions', () => ({
  postDecision: vi.fn(async () => {}),
  undoDecision: vi.fn(async () => {}),
}))

vi.mock('./api/health', () => ({ fetchHealth: vi.fn() }))
vi.mock('./api/auth', () => ({ logout: vi.fn(async () => {}) }))

const connected: Health = {
  status: 'ok',
  authenticated: true,
  writeEnabled: true,
  auth: { state: 'connected', tokenAgeDays: 1 },
  consentScreenTesting: true,
  downstreamPlaylistId: null,
  moveQueue: { pending: 0, failed: 0 },
  quota: { usedToday: 0, limit: 9500 },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchHealth).mockResolvedValue(connected)
})

describe('App', () => {
  it('renders the triage heading and eventually a card when connected', async () => {
    render(() => <App />)

    expect(screen.getByRole('heading', { name: /triage/i })).toBeInTheDocument()
    expect((await screen.findAllByTestId('video-card')).length).toBeGreaterThan(
      0,
    )
  })

  it('shows the connect screen when not logged in', async () => {
    vi.mocked(fetchHealth).mockResolvedValue({
      ...connected,
      authenticated: false,
      auth: { state: 'logged_out', tokenAgeDays: null },
    })
    render(() => <App />)

    const link = await screen.findByRole('link', { name: /connect youtube/i })
    expect(link).toHaveAttribute('href', '/api/auth/login')
    expect(screen.queryByTestId('video-card')).toBeNull()
  })

  it('shows the reconnect screen when the grant went dead', async () => {
    vi.mocked(fetchHealth).mockResolvedValue({
      ...connected,
      auth: {
        state: 'needs_reauth',
        reason: 'grant_invalid',
        tokenAgeDays: 8,
      },
    })
    render(() => <App />)

    expect(
      await screen.findByRole('link', { name: /reconnect youtube/i }),
    ).toBeInTheDocument()
  })

  it('logs out and drops back to the connect screen', async () => {
    vi.mocked(fetchHealth)
      .mockResolvedValueOnce(connected)
      .mockResolvedValue({
        ...connected,
        authenticated: false,
        auth: { state: 'logged_out', tokenAgeDays: null },
      })
    render(() => <App />)

    const button = await screen.findByRole('button', { name: /log out/i })
    fireEvent.click(button)

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByRole('link', { name: /connect youtube/i }),
    ).toBeInTheDocument()
  })

  it('hides the log out button when not logged in', async () => {
    vi.mocked(fetchHealth).mockResolvedValue({
      ...connected,
      authenticated: false,
      auth: { state: 'logged_out', tokenAgeDays: null },
    })
    render(() => <App />)

    await screen.findByRole('link', { name: /connect youtube/i })
    expect(screen.queryByRole('button', { name: /log out/i })).toBeNull()
  })

  it('falls back to the reconnect screen if videos 401 after health said connected', async () => {
    const { AuthRequiredError } = await import('./types')
    const { fetchVideos } = await import('./api/videos')
    vi.mocked(fetchHealth)
      .mockResolvedValueOnce(connected)
      .mockResolvedValue({
        ...connected,
        auth: {
          state: 'needs_reauth',
          reason: 'grant_invalid',
          tokenAgeDays: 8,
        },
      })
    vi.mocked(fetchVideos).mockRejectedValueOnce(new AuthRequiredError())

    render(() => <App />)

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /reconnect youtube/i }),
      ).toBeInTheDocument(),
    )
  })
})
