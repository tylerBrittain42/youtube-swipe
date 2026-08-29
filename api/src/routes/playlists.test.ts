import { describe, expect, it } from 'vitest'
import { buildApp } from '../server.ts'
import { fakeYoutube, makeContext } from '../test/helpers.ts'

describe('GET /api/playlists', () => {
  it('401s when not authenticated', async () => {
    const app = await buildApp(makeContext({ youtube: null }), {
      logger: false,
    })
    const res = await app.inject({ method: 'GET', url: '/api/playlists' })
    expect(res.statusCode).toBe(401)
  })

  it('returns id, title, and itemCount, paging through results', async () => {
    const yt = fakeYoutube({
      playlistsPages: [
        {
          items: [
            {
              id: 'PL1',
              snippet: { title: 'Triage' },
              contentDetails: { itemCount: 42 },
            },
          ],
          nextPageToken: 'p2',
        },
        {
          items: [
            {
              id: 'PL2',
              snippet: { title: 'Watch Later Dump' },
              contentDetails: { itemCount: 7 },
            },
          ],
        },
      ],
    })
    const app = await buildApp(makeContext({ youtube: yt.client }), {
      logger: false,
    })

    const res = await app.inject({ method: 'GET', url: '/api/playlists' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([
      { id: 'PL1', title: 'Triage', itemCount: 42 },
      { id: 'PL2', title: 'Watch Later Dump', itemCount: 7 },
    ])
    expect(yt.calls.playlists).toBe(2)
  })

  it('502s when the YouTube call fails', async () => {
    const yt = fakeYoutube({ failOn: 'playlists' })
    const app = await buildApp(makeContext({ youtube: yt.client }), {
      logger: false,
    })
    const res = await app.inject({ method: 'GET', url: '/api/playlists' })
    expect(res.statusCode).toBe(502)
  })
})
