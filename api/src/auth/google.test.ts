import { describe, expect, it } from 'vitest'
import { openDb } from '../db.ts'
import {
  getAuthStatus,
  isAuthError,
  markGrantInvalid,
  markGrantValid,
  saveToken,
} from './google.ts'

describe('isAuthError', () => {
  it('is true for a dead refresh token', () => {
    expect(
      isAuthError({ message: 'invalid_grant: Token has been expired' }),
    ).toBe(true)
    expect(
      isAuthError({ response: { data: { error: 'invalid_grant' } } }),
    ).toBe(true)
  })

  it('is true for a 401 from the Data API in any shape', () => {
    expect(isAuthError({ code: 401 })).toBe(true)
    expect(isAuthError({ status: 401 })).toBe(true)
    expect(isAuthError({ response: { status: 401 } })).toBe(true)
  })

  it('is false for not-found, server, and quota errors', () => {
    expect(isAuthError({ code: 404 })).toBe(false)
    expect(isAuthError({ code: 500 })).toBe(false)
    expect(isAuthError({ response: { status: 403 } })).toBe(false)
    expect(isAuthError(new Error('daily YouTube quota exhausted'))).toBe(false)
    expect(isAuthError('boom')).toBe(false)
  })
})

describe('auth_status helpers', () => {
  it('marks the grant invalid, keeping the first failure time', () => {
    const db = openDb(':memory:')
    markGrantInvalid(db, 'first')
    const first = getAuthStatus(db)?.invalidSince
    expect(first).toBeTypeOf('number')

    markGrantInvalid(db, 'second')
    const status = getAuthStatus(db)
    expect(status?.invalidSince).toBe(first)
    expect(status?.lastError).toBe('second')
  })

  it('markGrantValid clears the flag', () => {
    const db = openDb(':memory:')
    markGrantInvalid(db, 'boom')
    markGrantValid(db)
    expect(getAuthStatus(db)?.invalidSince).toBeNull()
  })
})

describe('saveToken', () => {
  it('stamps connected_at and clears an invalid flag on a fresh consent', () => {
    const db = openDb(':memory:')
    markGrantInvalid(db, 'boom')

    saveToken(db, { refresh_token: 'rt', access_token: 'at', scope: 's' })

    const status = getAuthStatus(db)
    expect(status?.connectedAt).toBeTypeOf('number')
    expect(status?.invalidSince).toBeNull()
  })

  it('does not move connected_at on a plain access-token refresh', () => {
    const db = openDb(':memory:')
    saveToken(db, { refresh_token: 'rt' })
    const connectedAt = getAuthStatus(db)?.connectedAt

    saveToken(db, { access_token: 'at2', expiry_date: 123 })

    expect(getAuthStatus(db)?.connectedAt).toBe(connectedAt)
  })
})
