import { render, fireEvent, screen } from '@solidjs/testing-library'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('updates the DOM when the counter signal changes', async () => {
    render(() => <App />)

    const button = screen.getByRole('button', { name: /count is 0/i })
    expect(button).toBeInTheDocument()

    await fireEvent.click(button)

    expect(
      screen.getByRole('button', { name: /count is 1/i }),
    ).toBeInTheDocument()
  })
})
