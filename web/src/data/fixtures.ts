import type { Video } from '../types'

/** Deterministic placeholder thumbnail so M1 has no network dependency. */
function placeholderThumb(seed: string, label: string): string {
  const hue = [...seed].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225">
    <rect width="400" height="225" fill="hsl(${hue} 55% 30%)" />
    <text x="50%" y="50%" fill="white" font-family="sans-serif" font-size="22"
      text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const RAW: Omit<Video, 'thumbnailUrl'>[] = [
  {
    id: 'v1',
    title: 'Building a Swipe UI From Scratch',
    channel: 'Frontend Foundry',
    duration: '14:22',
    url: 'https://www.youtube.com/watch?v=v1',
  },
  {
    id: 'v2',
    title: 'SolidJS Reactivity Explained in 10 Minutes',
    channel: 'Reactive Systems',
    duration: '10:05',
    url: 'https://www.youtube.com/watch?v=v2',
  },
  {
    id: 'v3',
    title: 'Why I Switched From React to Solid',
    channel: 'Dev Diaries',
    duration: '22:47',
    url: 'https://www.youtube.com/watch?v=v3',
  },
  {
    id: 'v4',
    title: 'YouTube API Quotas: What Nobody Tells You',
    channel: 'API Notes',
    duration: '8:13',
    url: 'https://www.youtube.com/watch?v=v4',
  },
  {
    id: 'v5',
    title: 'Gesture-Driven Interfaces on the Web',
    channel: 'Interaction Lab',
    duration: '18:59',
    url: 'https://www.youtube.com/watch?v=v5',
  },
  {
    id: 'v6',
    title: 'A Deep Dive Into OAuth2 Refresh Tokens',
    channel: 'Backend Bites',
    duration: '31:02',
    url: 'https://www.youtube.com/watch?v=v6',
  },
  {
    id: 'v7',
    title: 'SQLite as Your Only Database in 2026',
    channel: 'Small Stack',
    duration: '16:40',
    url: 'https://www.youtube.com/watch?v=v7',
  },
  {
    id: 'v8',
    title: 'Tailwind CSS: Utility-First, Five Years Later',
    channel: 'CSS Today',
    duration: '12:11',
    url: 'https://www.youtube.com/watch?v=v8',
  },
  {
    id: 'v9',
    title: 'Fastify vs Express: A Fair Benchmark',
    channel: 'Backend Bites',
    duration: '9:38',
    url: 'https://www.youtube.com/watch?v=v9',
  },
  {
    id: 'v10',
    title: 'Designing Undo for Destructive Actions',
    channel: 'Interaction Lab',
    duration: '13:27',
    url: 'https://www.youtube.com/watch?v=v10',
  },
]

export const FIXTURE_VIDEOS: Video[] = RAW.map((v) => ({
  ...v,
  thumbnailUrl: placeholderThumb(v.id, v.channel),
}))
