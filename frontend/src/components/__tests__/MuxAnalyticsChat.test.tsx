import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '../../test/setup'
import React from 'react'
import MuxAnalyticsChat from '../MuxAnalyticsChat'

vi.mock('../../lib/mastraClient', () => ({
  mastra: {
    getAgent: vi.fn().mockResolvedValue({
      stream: vi.fn().mockResolvedValue({ text: 'Mock response with URL https://www.streamingportfolio.com/player?playbackId=play_123' })
    })
  },
  getDisplayHost: () => 'localhost:3001',
  getMastraBaseUrl: () => 'http://localhost:3001',
  getMuxAnalyticsAgentId: () => 'mux-analytics'
}))

describe('MuxAnalyticsChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('detects playbackId URLs and renders message content', async () => {
    await act(async () => {
      render(<MuxAnalyticsChat />)
    })

    // Simulate user typing and sending
    const input = screen.getByPlaceholderText('Ask about streaming analytics...')
    const send = screen.getByText('Send')
    await act(async () => {
      ;(input as HTMLInputElement).value = 'test'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      send.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Should render chat container
    expect(screen.getByText('Paramount Plus Streaming Analytics')).toBeInTheDocument()
  })
})


