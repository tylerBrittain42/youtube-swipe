import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@solidjs/testing-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../types'
import SettingsBar from './SettingsBar'
import { fetchPlaylists } from '../api/playlists'
import { updateSettings } from '../api/settings'

vi.mock('../api/playlists', () => ({ fetchPlaylists: vi.fn() }))
vi.mock('../api/settings', () => ({ updateSettings: vi.fn() }))

const settings: Settings = {
  sourcePlaylistId: 'PL_A',
  downstreamPlaylistId: null,
  sortOrder: 'oldest',
}

const source = () => screen.getByTestId('source-select') as HTMLSelectElement
const dest = () => screen.getByTestId('dest-select') as HTMLSelectElement

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchPlaylists).mockResolvedValue([
    { id: 'PL_A', title: 'Playlist A', itemCount: 3 },
    { id: 'PL_B', title: 'Playlist B', itemCount: 9 },
  ])
  vi.mocked(updateSettings).mockImplementation(async (patch) => ({
    ...settings,
    ...patch,
  }))
})

describe('SettingsBar', () => {
  it('fills both selects from the playlist list, plus a "none" for the destination', async () => {
    render(() => <SettingsBar settings={settings} onSaved={() => {}} />)
    await waitFor(() => expect(source()).not.toBeDisabled())

    expect(
      within(source())
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Playlist A', 'Playlist B'])
    expect(
      within(dest())
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['— none —', 'Playlist A', 'Playlist B'])
  })

  it('saves and notifies when the source changes', async () => {
    const onSaved = vi.fn()
    render(() => <SettingsBar settings={settings} onSaved={onSaved} />)
    await waitFor(() => expect(source()).not.toBeDisabled())

    fireEvent.change(source(), { target: { value: 'PL_B' } })

    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({ sourcePlaylistId: 'PL_B' }),
    )
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('saves the sort order from the toggle', async () => {
    render(() => <SettingsBar settings={settings} onSaved={() => {}} />)
    await waitFor(() => expect(source()).not.toBeDisabled())

    fireEvent.click(screen.getByRole('button', { name: /newest first/i }))

    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({ sortOrder: 'newest' }),
    )
  })

  it('clears the destination with the none option', async () => {
    render(() => (
      <SettingsBar
        settings={{ ...settings, downstreamPlaylistId: 'PL_B' }}
        onSaved={() => {}}
      />
    ))
    await waitFor(() => expect(dest()).not.toBeDisabled())

    fireEvent.change(dest(), { target: { value: '' } })

    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        downstreamPlaylistId: null,
      }),
    )
  })

  it('surfaces a playlist load failure', async () => {
    vi.mocked(fetchPlaylists).mockRejectedValue(new Error('boom'))
    render(() => <SettingsBar settings={settings} onSaved={() => {}} />)

    expect(
      await screen.findByText(/couldn.t load playlists/i),
    ).toBeInTheDocument()
  })
})
