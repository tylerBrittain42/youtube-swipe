import { For, Show, createResource, createSignal } from 'solid-js'
import { fetchPlaylists } from '../api/playlists'
import { updateSettings } from '../api/settings'
import type { Playlist, Settings, SortOrder } from '../types'

/**
 * The row above the deck: pick the playlist being triaged, the left-swipe
 * destination, and the sort order. Every change auto-saves to `PUT /api/settings`
 * and then calls `onSaved` so the app can react (re-sync / reload the deck).
 */
export default function SettingsBar(props: {
  settings: Settings
  onSaved: () => void
}) {
  const [playlists] = createResource(fetchPlaylists)
  const [saving, setSaving] = createSignal(false)

  const busy = () => saving() || playlists.loading
  // `.latest` (not `playlists()`) so an errored resource doesn't re-throw here.
  const list = (): Playlist[] =>
    playlists.error ? [] : (playlists.latest ?? [])

  // Always include the currently-selected source even if it isn't in the
  // account's list (e.g. an env seed pointing at someone else's playlist).
  const sourceOptions = (): Playlist[] => {
    const all = list()
    const src = props.settings.sourcePlaylistId
    if (src && !all.some((p) => p.id === src)) {
      return [{ id: src, title: src, itemCount: 0 }, ...all]
    }
    return all
  }

  async function save(patch: Partial<Settings>) {
    setSaving(true)
    try {
      await updateSettings(patch)
      props.onSaved()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const selectClass =
    'rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-700 disabled:opacity-50'

  return (
    <div
      class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-neutral-500"
      data-testid="settings-bar"
    >
      <label class="flex items-center gap-1.5">
        <span>Source</span>
        <select
          class={selectClass}
          data-testid="source-select"
          disabled={busy()}
          value={props.settings.sourcePlaylistId}
          onChange={(e) => save({ sourcePlaylistId: e.currentTarget.value })}
        >
          <For each={sourceOptions()}>
            {(p) => <option value={p.id}>{p.title || p.id}</option>}
          </For>
        </select>
      </label>

      <label class="flex items-center gap-1.5">
        <span>Move to</span>
        <select
          class={selectClass}
          data-testid="dest-select"
          disabled={busy()}
          value={props.settings.downstreamPlaylistId ?? ''}
          onChange={(e) =>
            save({ downstreamPlaylistId: e.currentTarget.value || null })
          }
        >
          <option value="">— none —</option>
          <For each={list()}>
            {(p) => <option value={p.id}>{p.title || p.id}</option>}
          </For>
        </select>
      </label>

      <div
        class="inline-flex overflow-hidden rounded-lg border border-neutral-300"
        role="group"
        aria-label="Sort order"
      >
        <For
          each={
            [
              ['oldest', 'Oldest first'],
              ['newest', 'Newest first'],
            ] as [SortOrder, string][]
          }
        >
          {([value, label]) => (
            <button
              type="button"
              disabled={busy()}
              aria-pressed={props.settings.sortOrder === value}
              onClick={() => save({ sortOrder: value })}
              class="px-2.5 py-1.5 text-sm disabled:opacity-50"
              classList={{
                'bg-neutral-900 text-white': props.settings.sortOrder === value,
                'text-neutral-600 hover:bg-neutral-100':
                  props.settings.sortOrder !== value,
              }}
            >
              {label}
            </button>
          )}
        </For>
      </div>

      <Show when={playlists.error}>
        <span class="text-rose-500">Couldn’t load playlists</span>
      </Show>
    </div>
  )
}
