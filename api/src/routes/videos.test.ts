import { describe, expect, it } from 'vitest'
import { buildApp } from '../server.ts'
import {
  fakeYoutube,
  makeContext,
  markSynced,
  seedVideo,
} from '../test/helpers.ts'

async function appWithYoutube(present: boolean) {
  const ctx = makeContext({
    youtube: present ? fakeYoutube().client : null,
  })
  const app = await buildApp(ctx, { logger: false })
  return { ctx, app }
}

describe('GET /api/videos', () => {
  it('401s with a login URL when not authenticated', async () => {
    const { app } = await appWithYoutube(false)
    const res = await app.inject({ method: 'GET', url: '/api/videos' })

    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({
      error: 'not_authenticated',
      loginUrl: '/api/auth/login',
    })
  })

  it('returns cached videos in playlist order in the Video shape', async () => {
    const { ctx, app } = await appWithYoutube(true)
    markSynced(ctx)
    seedVideo(ctx, { id: 'c', position: 2 })
    seedVideo(ctx, { id: 'a', position: 0 })
    seedVideo(ctx, { id: 'b', position: 1 })

    const res = await app.inject({ method: 'GET', url: '/api/videos' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.map((v: { id: string }) => v.id)).toEqual(['a', 'b', 'c'])
    expect(Object.keys(body[0]).sort()).toEqual([
      'channel',
      'duration',
      'id',
      'thumbnailUrl',
      'title',
      'url',
    ])
  })

  it('clamps limit to 1..50 and defaults to 10', async () => {
    const { ctx, app } = await appWithYoutube(true)
    markSynced(ctx)
    for (let i = 0; i < 60; i++) seedVideo(ctx, { id: `v${i}`, position: i })

    const def = await app.inject({ method: 'GET', url: '/api/videos' })
    expect(def.json()).toHaveLength(10)

    const high = await app.inject({
      method: 'GET',
      url: '/api/videos?limit=100',
    })
    expect(high.json()).toHaveLength(50)

    const low = await app.inject({ method: 'GET', url: '/api/videos?limit=0' })
    expect(low.json()).toHaveLength(1)
  })

  it('502s when the YouTube sync fails', async () => {
    const ctx = makeContext({
      youtube: fakeYoutube({ failOn: 'playlistItems' }).client,
    })
    const app = await buildApp(ctx, { logger: false })

    const res = await app.inject({ method: 'GET', url: '/api/videos' })
    expect(res.statusCode).toBe(502)
    expect(res.json().error).toBe('youtube_error')
  })
})
