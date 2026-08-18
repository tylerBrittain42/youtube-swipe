import { render, screen } from '@solidjs/testing-library'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the triage heading and eventually a card', async () => {
    render(() => <App />)

    expect(screen.getByRole('heading', { name: /triage/i })).toBeInTheDocument()
    expect((await screen.findAllByTestId('video-card')).length).toBeGreaterThan(
      0,
    )
  })
})
