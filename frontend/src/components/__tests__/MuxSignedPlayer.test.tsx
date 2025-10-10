import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '../../test/setup'
import React from 'react'
import MuxSignedPlayer from '../MuxSignedPlayer'

// Mock dynamic import of @mux/mux-player-react
vi.mock('@mux/mux-player-react', () => ({
  default: React.forwardRef((props: any, _ref) => {
    return React.createElement('div', {
      'data-testid': 'mux-player',
      ...props,
    })
  })
}))

describe('MuxSignedPlayer', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(global as any).fetch = vi.fn()
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  it('requests token with playbackId when provided and does not fallback assetId', async () => {
    // Arrange
    const keyServerResponse = {
      playbackId: 'playback_abc',
      token: 'token_123',
    }
    vi.mocked(fetch as any).mockResolvedValue({
      ok: true,
      json: async () => keyServerResponse,
      headers: new Headers(),
      status: 200
    })

    // Act
    render(<MuxSignedPlayer playbackId="playback_abc" />)

    // Assert
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetch) as any).mock.calls[0][1].body)
    expect(body.playbackId).toBe('playback_abc')
    expect(body.assetId).toBeUndefined()

    // Player should render with tokens once ready
    await screen.findByTestId('mux-player')
  })

  it('requests token with assetId when playbackId absent and can use env fallback', async () => {
    // Arrange
    import.meta.env.VITE_MUX_ASSET_ID = 'asset_env'
    const keyServerResponse = {
      playbackId: 'playback_xyz',
      token: 'token_456',
    }
    vi.mocked(fetch as any).mockResolvedValue({
      ok: true,
      json: async () => keyServerResponse,
      headers: new Headers(),
      status: 200
    })

    // Act
    render(<MuxSignedPlayer />)

    // Assert
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetch) as any).mock.calls[0][1].body)
    expect(body.assetId).toBe('asset_env')
    expect(body.playbackId).toBeUndefined()
  })

  it('caches token responses to avoid duplicate network calls', async () => {
    const keyServerResponse = {
      playbackId: 'playback_cache',
      token: 'token_cache',
    }
    const fetchMock = vi.mocked(fetch as any)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => keyServerResponse,
      headers: new Headers(),
      status: 200
    })

    const { rerender } = render(<MuxSignedPlayer playbackId="playback_cache" />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    // Rerender with same inputs should use cache
    rerender(<MuxSignedPlayer playbackId="playback_cache" />)
    await screen.findByTestId('mux-player')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})


