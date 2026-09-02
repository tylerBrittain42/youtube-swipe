import { render, screen, waitFor } from '@solidjs/testing-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Health } from '../types'
import SyncStatus from './SyncStatus'
import { fetchHealth } from '../api/health'

vi.mock('../api/health', () => ({ fetchHealth: vi.fn() }))

const base: Health = {
  status: 'ok',
  authenticated: true,
  writeEnabled: true,
  auth: { state: 'connected', tokenAgeDays: 1 },
  consentScreenTesting: true,
  downstreamPlaylistId: 'PL_REJECT',
  moveQueue: { pending: 0, failed: 0 },
  quota: { usedToday: 0, limit: 9500 },
}

function mockHealth(overrides: Partial<Health>) {
  vi.mocked(fetchHealth).mockResolvedValue({ ...base, ...overrides })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SyncStatus', () => {
  it('renders nothing when the queue is empty and the scope is granted', async () => {
    mockHealth({})
    render(() => <SyncStatus />)
    await waitFor(() => expect(fetchHealth).toHaveBeenCalled())
    expect(screen.queryByTestId('sync-status')).toBeNull()
  })

  it('shows how many moves are syncing', async () => {
    mockHealth({ moveQueue: { pending: 3, failed: 0 } })
    render(() => <SyncStatus />)
    expect(await screen.findByTestId('sync-status')).toHaveTextContent(
      '3 moves syncing…',
    )
  })

  it('singularises one move', async () => {
    mockHealth({ moveQueue: { pending: 1, failed: 0 } })
    render(() => <SyncStatus />)
    expect(await screen.findByTestId('sync-status')).toHaveTextContent(
      '1 move syncing…',
    )
  })

  it('warns when the daily quota is spent and moves are still queued', async () => {
    mockHealth({
      moveQueue: { pending: 2, failed: 0 },
      quota: { usedToday: 9500, limit: 9500 },
    })
    render(() => <SyncStatus />)
    expect(await screen.findByTestId('sync-status')).toHaveTextContent(
      /daily quota reached/i,
    )
  })

  it('surfaces failed moves', async () => {
    mockHealth({ moveQueue: { pending: 0, failed: 1 } })
    render(() => <SyncStatus />)
    expect(await screen.findByTestId('sync-status')).toHaveTextContent(
      '1 move failed to sync',
    )
  })

  it('prompts re-authorization when the write scope is missing', async () => {
    mockHealth({
      writeEnabled: false,
      auth: {
        state: 'needs_reauth',
        reason: 'missing_write_scope',
        tokenAgeDays: 1,
      },
    })
    render(() => <SyncStatus />)
    const link = await screen.findByRole('link', {
      name: /re-authorize to enable moves/i,
    })
    expect(link).toHaveAttribute('href', '/api/auth/login')
  })

  it('does not prompt re-auth when the grant is connected', async () => {
    mockHealth({})
    render(() => <SyncStatus />)
    await waitFor(() => expect(fetchHealth).toHaveBeenCalled())
    expect(screen.queryByTestId('sync-status')).toBeNull()
  })

  it('nudges to reconnect as the Testing-window expiry approaches', async () => {
    mockHealth({ auth: { state: 'connected', tokenAgeDays: 6 } })
    render(() => <SyncStatus />)
    const link = await screen.findByRole('link', {
      name: /access expires soon/i,
    })
    expect(link).toHaveAttribute('href', '/api/auth/login')
  })

  it('does not nudge once the consent screen is out of Testing', async () => {
    mockHealth({
      consentScreenTesting: false,
      auth: { state: 'connected', tokenAgeDays: 30 },
    })
    render(() => <SyncStatus />)
    await waitFor(() => expect(fetchHealth).toHaveBeenCalled())
    expect(screen.queryByTestId('sync-status')).toBeNull()
  })
})
