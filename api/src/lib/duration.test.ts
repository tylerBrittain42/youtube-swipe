import { describe, expect, it } from 'vitest'
import { formatDuration } from './duration.ts'

describe('formatDuration', () => {
  it('formats hours with zero-padded minutes and seconds', () => {
    expect(formatDuration('PT1H2M3S')).toBe('1:02:03')
  })

  it('formats sub-hour durations without an hours field', () => {
    expect(formatDuration('PT4M5S')).toBe('4:05')
    expect(formatDuration('PT14M22S')).toBe('14:22')
  })

  it('handles missing components', () => {
    expect(formatDuration('PT45S')).toBe('0:45')
    expect(formatDuration('PT3M')).toBe('3:00')
    expect(formatDuration('PT2H')).toBe('2:00:00')
  })

  it('returns 0:00 for zero, live streams, and junk', () => {
    expect(formatDuration('PT0S')).toBe('0:00')
    expect(formatDuration('P0D')).toBe('0:00')
    expect(formatDuration('')).toBe('0:00')
    expect(formatDuration(null)).toBe('0:00')
    expect(formatDuration(undefined)).toBe('0:00')
    expect(formatDuration('garbage')).toBe('0:00')
  })

  it('handles long durations', () => {
    expect(formatDuration('PT10H0M0S')).toBe('10:00:00')
  })
})
