import { describe, expect, it } from 'vitest'
import { openDb } from './db.ts'
import { getSettings, putSettings } from './settings.ts'
import { testConfig } from './test/helpers.ts'

const config = testConfig({
  playlistId: 'PL_SOURCE',
  downstreamPlaylistId: 'PL_DOWN',
})

describe('getSettings', () => {
  it('seeds from config on first read and persists the row', () => {
    const db = openDb(':memory:')

    expect(getSettings(db, config)).toEqual({
      sourcePlaylistId: 'PL_SOURCE',
      downstreamPlaylistId: 'PL_DOWN',
      sortOrder: 'oldest',
    })

    const row = db.prepare('SELECT * FROM settings WHERE id = 1').get()
    expect(row).toBeDefined()
  })

  it('lets the stored row win over config once seeded', () => {
    const db = openDb(':memory:')
    putSettings(db, config, { sourcePlaylistId: 'PL_OTHER' })

    const changed = testConfig({ playlistId: 'PL_IGNORED' })
    expect(getSettings(db, changed).sourcePlaylistId).toBe('PL_OTHER')
  })
})

describe('putSettings', () => {
  it('merges a partial patch', () => {
    const db = openDb(':memory:')
    getSettings(db, config)

    expect(putSettings(db, config, { sortOrder: 'newest' })).toEqual({
      sourcePlaylistId: 'PL_SOURCE',
      downstreamPlaylistId: 'PL_DOWN',
      sortOrder: 'newest',
    })
  })

  it('can clear the downstream playlist with null', () => {
    const db = openDb(':memory:')
    expect(
      putSettings(db, config, { downstreamPlaylistId: null })
        .downstreamPlaylistId,
    ).toBeNull()
  })
})
