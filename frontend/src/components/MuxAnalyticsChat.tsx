import { useCallback, useMemo, useRef, useState, useEffect, memo } from 'react'
import { mastra, getMuxAnalyticsAgentId, getDisplayHost, getMastraBaseUrl } from '../lib/mastraClient'
import { useStreamVNext } from '../hooks/useStreamVNext'
import type { StreamChunk } from '../types/streamVNext'
import { useMuxAnalytics } from '../contexts/MuxAnalyticsContext'
import { formatTextWithCode, renderFormattedSegments } from '../utils/codeFormatter'
import { useSpeechToText } from '../hooks/useSpeechToText'

/**
 * Mux Analytics Chat Component for Paramount Plus Streaming Analytics
 * 
 * Simplified interface for analyzing Mux video streaming data with AI-powered insights
 */

/**
 * Represents a chat message with metadata
 */
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

/**
 * Analytics agent interface for type safety
 */
interface MuxAnalyticsAgent {
  stream: (params: {
    messages: Array<{ role: string; content: string }> | string;
    [key: string]: any;
  }) => Promise<any>
}

/**
 * Memoized message component to prevent unnecessary re-renders
 * @param message - The message to display
 * @param isStreaming - Whether the message is currently being streamed
 */
const MessageComponent = memo(({ message, isStreaming = false }: { message: Message; isStreaming?: boolean }) => {
  const { setCurrentVideo } = useMuxAnalytics()
  const [detectedVideoUrl, setDetectedVideoUrl] = useState<string | null>(null)
  const [lastAppliedAssetId, setLastAppliedAssetId] = useState<string | null>(null)
  const [lastAppliedPlaybackId, setLastAppliedPlaybackId] = useState<string | null>(null)
  
  // Effect to handle video loading and updates (handles streaming updates)
  useEffect(() => {
    if (!detectedVideoUrl) return
    
    // Debounce URL processing to avoid excessive updates during streaming
    const timeoutId = setTimeout(() => {
      try {
        const url = new URL(detectedVideoUrl)
        const assetId = url.searchParams.get('assetId') || url.searchParams.get('assetID') || url.searchParams.get('assetid') || url.searchParams.get('asset_id')
        const playbackId = url.searchParams.get('playbackId') || url.searchParams.get('playbackID') || url.searchParams.get('playbackid') || url.searchParams.get('playback_id')

        // Preconnect to player and keyserver to speed up inline playback (only once)
        try {
          const ensurePreconnect = (href: string) => {
            if (!href) return
            const url = new URL(href, window.location.href)
            const origin = url.origin
            const has = Array.from(document.querySelectorAll('link[rel="preconnect"]')).some((el: any) => el.href.startsWith(origin))
            if (!has) {
              const link = document.createElement('link')
              link.rel = 'preconnect'
              link.href = origin
              link.crossOrigin = 'anonymous'
              document.head.appendChild(link)
            }
          }
          ensurePreconnect('https://stream.mux.com')
          ensurePreconnect('https://image.mux.com')
          ensurePreconnect('https://www.streamingportfolio.com')
        } catch {}

        // Only apply when we have meaningful update:
        // - playbackId newly available or changed
        // - assetId becomes valid length (>= 20) or changed
        const isValidAssetId = assetId && assetId.length >= 20
        const shouldUpdateByPlayback = !!playbackId && playbackId !== lastAppliedPlaybackId
        const shouldUpdateByAsset = !!isValidAssetId && assetId !== lastAppliedAssetId

        if (shouldUpdateByPlayback || shouldUpdateByAsset) {
          console.log('[MessageComponent] Updating video player with:', { assetId, playbackId })
          setCurrentVideo({
            assetId: isValidAssetId ? assetId || undefined : undefined,
            playbackId: playbackId || undefined
          })
          if (shouldUpdateByAsset && isValidAssetId) setLastAppliedAssetId(assetId!)
          if (shouldUpdateByPlayback) setLastAppliedPlaybackId(playbackId!)
        }
      } catch (error) {
        console.error('[MessageComponent] Failed to parse video URL:', error)
      }
    }, 500) // 500ms debounce to reduce excessive updates during streaming
    
    return () => clearTimeout(timeoutId)
  }, [detectedVideoUrl, lastAppliedAssetId, lastAppliedPlaybackId, setCurrentVideo])
  
  // Function to detect and extract Mux video URLs (memoized to avoid excessive regex)
  const detectMuxVideo = useMemo(() => {
    // Cache the last detected URL to avoid re-processing
    let lastDetectedUrl: string | null = null
    let lastContentHash: string | null = null
    
    return (content: string): string | null => {
      // Quick check: if content hasn't changed significantly, return cached result
      const contentHash = content.slice(-200) // Only check last 200 chars for performance
      if (contentHash === lastContentHash && lastDetectedUrl) {
        return lastDetectedUrl
      }
      
      // More comprehensive pattern that handles various URL formats and spacing issues
      const patterns = [
      // Any subdomain (or none) under streamingportfolio.com, player or player.html, with assetId/playbackId
      /https:\/\/(?:[\w.-]+\.)?streamingportfolio\.com\/player(?:\.html)?\?(?:assetId|asset_id|playbackId|playback_id)=([a-zA-Z0-9]+)(?:&[^\s]*)?/g,
      // Standard format with potential spacing issues
      /https:\s*:\s*\/\s*\/\s*streamingportfolio\s*\.\s*com\s*\/\s*player\s*\?\s*assetId\s*=\s*([a-zA-Z0-9]+)/g,
      // Clean standard format
      /https:\/\/streamingportfolio\.com\/player\?assetId=([a-zA-Z0-9]+)/g,
      // With additional parameters
      /https:\/\/streamingportfolio\.com\/player\?assetId=([a-zA-Z0-9]+)(?:&[^\\s]*)?/g,
      // With playbackId parameter (alternative format)
      /https:\/\/streamingportfolio\.com\/player\?playbackId=([a-zA-Z0-9]+)/g,
      // Snake_case params
      /https:\/\/streamingportfolio\.com\/player\?asset_id=([a-zA-Z0-9]+)/g,
      /https:\/\/streamingportfolio\.com\/player\?playback_id=([a-zA-Z0-9]+)/g,
      // Handle URLs with line breaks or special characters
      /https:\/\/streamingportfolio\.com\/player\?assetId=([a-zA-Z0-9]+)(?:\s|$)/g,
      // New .html format patterns
      /https:\/\/streamingportfolio\.com\/player\.html\?assetId=([a-zA-Z0-9]+)/g,
      /https:\/\/streamingportfolio\.com\/player\.html\?assetId=([a-zA-Z0-9]+)(?:&[^\\s]*)?/g,
      /https:\/\/streamingportfolio\.com\/player\.html\?playbackId=([a-zA-Z0-9]+)/g,
      /https:\/\/streamingportfolio\.com\/player\.html\?asset_id=([a-zA-Z0-9]+)/g,
      /https:\/\/streamingportfolio\.com\/player\.html\?playback_id=([a-zA-Z0-9]+)/g,
      /https:\/\/streamingportfolio\.com\/player\.html\?assetId=([a-zA-Z0-9]+)(?:\s|$)/g,
      // www subdomain patterns
      /https:\/\/www\.streamingportfolio\.com\/player\?assetId=([a-zA-Z0-9]+)/g,
      /https:\/\/www\.streamingportfolio\.com\/player\?assetId=([a-zA-Z0-9]+)(?:&[^\\s]*)?/g,
      /https:\/\/www\.streamingportfolio\.com\/player\?playbackId=([a-zA-Z0-9]+)/g,
      /https:\/\/www\.streamingportfolio\.com\/player\?asset_id=([a-zA-Z0-9]+)/g,
      /https:\/\/www\.streamingportfolio\.com\/player\?playback_id=([a-zA-Z0-9]+)/g,
      /https:\/\/www\.streamingportfolio\.com\/player\.html\?assetId=([a-zA-Z0-9]+)/g,
      /https:\/\/www\.streamingportfolio\.com\/player\.html\?assetId=([a-zA-Z0-9]+)(?:&[^\\s]*)?/g,
      /https:\/\/www\.streamingportfolio\.com\/player\.html\?playbackId=([a-zA-Z0-9]+)/g,
      /https:\/\/www\.streamingportfolio\.com\/player\.html\?asset_id=([a-zA-Z0-9]+)/g,
      /https:\/\/www\.streamingportfolio\.com\/player\.html\?playback_id=([a-zA-Z0-9]+)/g,
      /https:\/\/www\.streamingportfolio\.com\/player\.html\?assetId=([a-zA-Z0-9]+)(?:\s|$)/g
    ];
    
      for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches) {
          // Clean up the URL by removing any extra spaces and normalize
          const cleanUrl = matches[0].replace(/\s+/g, '').trim();
          console.log('[detectMuxVideo] Found URL:', cleanUrl);
          lastDetectedUrl = cleanUrl
          lastContentHash = contentHash
          return cleanUrl;
        }
      }
      
      lastContentHash = contentHash
      return null;
    }
  }, [])

  // Function to detect and extract image URLs (including chart URLs)
  const detectImageUrl = (content: string) => {
    // First check for markdown image syntax: ![alt](url)
    const markdownImagePattern = /!\[[^\]]*\]\(([^\s]+\.(png|jpg|jpeg|gif|webp|svg)(?:\?[^\s]*)?)\)/gi;
    const markdownMatch = content.match(markdownImagePattern);
    if (markdownMatch) {
      const urlMatch = markdownMatch[0].match(/\(([^)]+)\)/);
      if (urlMatch && urlMatch[1]) {
        return urlMatch[1];
      }
    }
    // Fallback to direct URL pattern (supports both http and https)
    const imagePattern = /https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg)(?:\?[^\s]*)?/gi;
    const matches = content.match(imagePattern);
    return matches ? matches[0] : null;
  }
  
  // Function to extract all image URLs from content
  const extractAllImageUrls = (content: string): string[] => {
    const urls: string[] = [];
    // Extract markdown images (supports both http and https)
    const markdownImagePattern = /!\[[^\]]*\]\(([^\s]+\.(png|jpg|jpeg|gif|webp|svg)(?:\?[^\s]*)?)\)/gi;
    let match;
    while ((match = markdownImagePattern.exec(content)) !== null) {
      if (match[1]) urls.push(match[1]);
    }
    // Extract direct URLs (supports both http and https)
    const directUrlPattern = /https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg)(?:\?[^\s]*)?/gi;
    let urlMatch;
    while ((urlMatch = directUrlPattern.exec(content)) !== null) {
      if (!urls.includes(urlMatch[0])) {
        urls.push(urlMatch[0]);
      }
    }
    return urls;
  }

  // Function to format text content with code detection
  const formatTextContent = (text: string) => {
    const segments = formatTextWithCode(text);
    return renderFormattedSegments(segments);
  }

  // Function to render content with URL detection
  const renderContent = (content: string) => {
    // Check for Mux video URL
    const muxVideoUrl = detectMuxVideo(content)
    
    if (muxVideoUrl) {
      // Set the detected URL to trigger useEffect for loading
      if (!detectedVideoUrl || muxVideoUrl !== detectedVideoUrl) {
        setDetectedVideoUrl(muxVideoUrl)
      }
      
      // Remove the video URL from the text content
      const textContent = content.replace(muxVideoUrl, '').trim()
      
      return (
        <div className="space-y-1.5">
          {/* Render text content first */}
          {textContent && (
            <div className="prose prose-sm max-w-none chat-message">
              <div className="whitespace-pre-wrap leading-tight text-xs">
                {formatTextContent(textContent)}
              </div>
            </div>
          )}
          {/* Show notification that audio is loaded in the main player */}
          <div className="mt-3 p-3 rounded-xl border-2 shadow-lg" style={{ 
            backgroundColor: 'var(--accent-muted)', 
            borderColor: 'var(--accent)',
            borderWidth: '2px'
          }}>
            <div className="flex items-start gap-3">
              <div className="text-2xl flex-shrink-0">🎧</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold mb-1 text-sm" style={{ color: 'var(--fg)' }}>
                  Audio Report Ready
                </div>
                <div className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
                  Your audio report is now available in the player on the left. Click play to listen to the analytics summary.
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={(e) => {
                      navigator.clipboard.writeText(muxVideoUrl).then(() => {
                        // Show temporary success feedback
                        const button = e.target as HTMLButtonElement;
                        const originalText = button.textContent;
                        button.textContent = '✓ Copied!';
                        button.style.backgroundColor = 'var(--ok)';
                        setTimeout(() => {
                          button.textContent = originalText;
                          button.style.backgroundColor = '';
                        }, 2000);
                      }).catch(err => {
                        console.error('Failed to copy URL:', err);
                      });
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-all hover:scale-105"
                    style={{ 
                      backgroundColor: 'var(--accent)', 
                      borderColor: 'var(--accent)',
                      color: 'var(--accent-contrast)',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  >
                    Copy URL
                  </button>
                  <a 
                    href={muxVideoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-all hover:scale-105 inline-block"
                    style={{ 
                      backgroundColor: 'var(--bg)', 
                      borderColor: 'var(--border)',
                      color: 'var(--fg)',
                      textDecoration: 'none',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  >
                    Open in New Tab
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // Check for image URLs (charts, visualizations)
    const imageUrls = extractAllImageUrls(content)
    if (imageUrls.length > 0) {
      // Remove image URLs from text content for cleaner display
      let textContent = content
      imageUrls.forEach(url => {
        // Remove markdown image syntax
        textContent = textContent.replace(new RegExp(`!\\[[^\\]]*\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'), '')
        // Remove direct URLs
        textContent = textContent.replace(url, '')
      })
      textContent = textContent.trim()
      
      return (
        <div className="space-y-2">
          {textContent && (
            <div className="prose prose-sm max-w-none chat-message">
              <div className="whitespace-pre-wrap leading-tight text-xs">
                {formatTextContent(textContent)}
              </div>
            </div>
          )}
          <div className="space-y-3 mt-3">
            {imageUrls.map((imageUrl, idx) => (
              <div key={idx} className="relative group/chart">
                <div className="rounded-xl border-2 overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
                  style={{ 
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--bg-soft)'
                  }}>
                  <img 
                    src={imageUrl} 
                    alt={`Chart ${idx + 1}`}
                    className="max-w-full h-auto block"
                    loading="lazy"
                    decoding="async"
                    style={{ 
                      minHeight: '200px',
                      backgroundColor: 'var(--bg-soft)'
                    }}
                    onError={(e) => {
                      console.warn('Failed to load image:', imageUrl);
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                    onLoad={(e) => {
                      // Add smooth fade-in effect
                      const target = e.target as HTMLImageElement;
                      target.style.opacity = '0';
                      target.style.transition = 'opacity 0.3s ease-in';
                      requestAnimationFrame(() => {
                        target.style.opacity = '1';
                      });
                    }}
                  />
                </div>
                {imageUrl.includes('chart') && (
                  <div className="flex items-center justify-center gap-1.5 mt-2 text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>
                    <span>📊</span>
                    <span>Analytics Chart {imageUrls.length > 1 ? `${idx + 1}/${imageUrls.length}` : ''}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }

    // Default text rendering
    return (
      <div className="prose prose-sm max-w-none chat-message">
        <div className="whitespace-pre-wrap leading-tight text-xs">
          {formatTextContent(content)}
        </div>
      </div>
    )
  }

  return (
    <div className={`whitespace-pre-wrap text-xs group ${message.role === 'user' ? 'ml-auto' : ''}`}>
      <div className={`flex items-start gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
        <div className={`flex-1 min-w-0 rounded-lg p-2.5 ${
          message.role === 'user' 
            ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800' 
            : 'bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700'
        }`}>
          {renderContent(message.content)}
        </div>
        {/* Only show copy button when streaming is complete */}
        {!isStreaming && (
          <button
            onClick={(e) => {
              navigator.clipboard.writeText(message.content).then(() => {
                // Show temporary success feedback
                const button = e.target as HTMLButtonElement;
                const originalText = button.textContent;
                button.textContent = '✓';
                button.style.color = 'var(--ok)';
                setTimeout(() => {
                  button.textContent = originalText;
                  button.style.color = '';
                }, 2000);
              }).catch(err => {
                console.error('Failed to copy message:', err);
              });
            }}
            className="text-[10px] px-2 py-1 rounded-md border transition-all hover:scale-105 opacity-0 group-hover:opacity-100 flex-shrink-0"
            style={{ 
              backgroundColor: 'var(--bg)', 
              borderColor: 'var(--border)',
              color: 'var(--fg-muted)'
            }}
            title="Copy message text"
          >
            Copy
          </button>
        )}
      </div>
      <div className={`text-[10px] mt-1 opacity-60 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  )
})

MessageComponent.displayName = 'MessageComponent'

/**
 * Mux Analytics Chat Component
 * 
 * This component provides a chat interface for video analytics queries,
 * with enhanced error handling and user feedback.
 * 
 * @returns JSX element representing the analytics chat interface
 */
export default function MuxAnalyticsChat() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasAssistantResponded, setHasAssistantResponded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Optional Mux analytics - only use if provider is available
  const muxAnalytics = useMuxAnalytics()

  const [streamingContent, setStreamingContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)

  const [agent, setAgent] = useState<MuxAnalyticsAgent | null>(null)
  const [agentError, setAgentError] = useState<string | null>(null)

  // Speech-to-text functionality
  const {
    isListening,
    isSupported: isSpeechSupported,
    transcript,
    error: speechError,
    startListening,
    stopListening,
    clearTranscript
  } = useSpeechToText({
    onTranscription: (text) => {
      setInput(prev => prev + (prev ? ' ' : '') + text)
      clearTranscript()
    },
    onError: (error) => {
      console.error('Speech recognition error:', error)
    }
  })

  // Load agent asynchronously with retry logic
  useEffect(() => {
    let retryCount = 0
    const maxRetries = 3
    const retryDelay = 1000

    const loadAgent = async () => {
      try {
        const agentId = getMuxAnalyticsAgentId()
        const loadedAgent = await mastra.getAgent(agentId)
        setAgent(loadedAgent as MuxAnalyticsAgent)
        setAgentError(null)
        retryCount = 0 // Reset retry count on success
      } catch (error) {
        let errorMessage: string
        if (error instanceof Error) {
          errorMessage = error.message
        } else {
          errorMessage = String(error)
        }
        
        console.error(`[MuxAnalyticsChat] Failed to load agent (attempt ${retryCount + 1}):`, errorMessage)
        
        retryCount++
        if (retryCount < maxRetries) {
          setAgentError(`Loading agent... (retry ${retryCount}/${maxRetries})`)
          setTimeout(loadAgent, retryDelay * retryCount)
        } else {
          setAgentError(`Failed to load agent after ${maxRetries} attempts: ${errorMessage}`)
        }
      }
    }

    loadAgent()
  }, [])

  // Only scroll to bottom when user sends a new message (not during streaming)
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  // Scroll to bottom only when a new message is added (user sends or assistant starts responding)
  useEffect(() => {
    // Only scroll when message count changes, not during streaming
    if (messages.length > 0 && !isStreaming) {
      scrollToBottom()
    }
  }, [messages.length, scrollToBottom, isStreaming])

  /**
   * Internal function to send a message (extracted from onSend)
   */
  const sendMessage = useCallback(async (messageText: string, existingMessages: Message[] = []) => {
    if (!agent) return

    setIsLoading(true)
    setIsStreaming(true)
    setError(null)
    setStreamingContent('')
    
    console.log('[MuxAnalyticsChat] Sending message:', messageText)
    
    // Use provided messages or current state
    const currentMessages = existingMessages.length > 0 ? existingMessages : messages
    
    // Convert our message history to the format expected by the backend
    const messageHistory = currentMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))
    
    // Add the new user message
    messageHistory.push({ role: 'user', content: messageText })

    const baseUrl = getMastraBaseUrl().replace(/\/$/, '')

    // Helper to stream from a specific endpoint
    const streamFrom = async (endpointPath: string) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 300000) // 5 minute timeout
      
      try {
        console.log(`[MuxAnalyticsChat] Fetching from ${baseUrl}${endpointPath}`)
        const response = await fetch(`${baseUrl}${endpointPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: messageHistory }),
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        console.log(`[MuxAnalyticsChat] Response status: ${response.status}, ok: ${response.ok}`)
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText)
          console.error(`[MuxAnalyticsChat] Response error: ${response.status} - ${errorText}`)
          throw new Error(`HTTP ${response.status}: ${errorText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          console.log('[MuxAnalyticsChat] No reader available, reading as text')
          const textContent = await response.text()
          setStreamingContent(textContent)
          console.log('[MuxAnalyticsChat] Text content length:', textContent.length)
          return textContent.trim().length > 0
        }

        const decoder = new TextDecoder()
        let fullContent = ''
        let chunkCount = 0
        let lastChunkTime = Date.now()
        const startTime = Date.now()
        
        try {
          while (true) {
            const readPromise = reader.read()
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Read timeout')), 60000) // 60s timeout per read
            )
            
            const { done, value } = await Promise.race([readPromise, timeoutPromise]) as ReadableStreamReadResult<Uint8Array>
            
            if (done) {
              const elapsed = Date.now() - startTime
              console.log(`[MuxAnalyticsChat] Stream ended. Total chunks: ${chunkCount}, Content length: ${fullContent.length}, Time: ${elapsed}ms`)
              break
            }
            
            if (value) {
              lastChunkTime = Date.now()
              chunkCount++
              const chunk = decoder.decode(value, { stream: true })
              if (chunk) {
                fullContent += chunk
                setStreamingContent(fullContent)
                if (chunkCount % 10 === 0 || chunk.length > 100) {
                  console.log(`[MuxAnalyticsChat] Streamed chunk ${chunkCount}:`, chunk.length, 'chars')
                }
              }
            }
          }
          
          console.log('[MuxAnalyticsChat] Final content length:', fullContent.length)
          
          // Check if we got meaningful content
          if (fullContent.trim().length === 0) {
            console.warn('[MuxAnalyticsChat] Stream completed but no content received')
            throw new Error('Stream completed but no content was received')
          }
          
          return true
        } catch (e: any) {
          console.warn('[MuxAnalyticsChat] Stream error:', e)
          // If we have meaningful content, keep it and treat as success
          if (fullContent.trim().length > 50) {
            console.log('[MuxAnalyticsChat] Using partial content from interrupted stream:', fullContent.length, 'chars')
            return true
          }
          // If it's a timeout but we have some content, still return success
          if (e.message === 'Read timeout' && fullContent.trim().length > 0) {
            console.log('[MuxAnalyticsChat] Read timeout but have content, treating as success')
            return true
          }
          throw e
        } finally {
          try { 
            reader.releaseLock() 
          } catch (releaseError) {
            console.warn('[MuxAnalyticsChat] Error releasing reader:', releaseError)
          }
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        console.error('[MuxAnalyticsChat] Fetch error:', fetchError)
        if (fetchError.name === 'AbortError') {
          throw new Error('Request timeout - the response took too long')
        }
        if (fetchError.message?.includes('ERR_EMPTY_RESPONSE') || fetchError.message?.includes('Failed to fetch')) {
          throw new Error('Connection error - the server may be restarting or unavailable')
        }
        throw fetchError
      }
    }

    // Try modern endpoints in order
    const endpoints = [
      '/api/agents/mux-analytics/stream',
      '/api/agents/mux-analytics/streamVNext',
      '/api/agents/mux-analytics/stream/vnext'
    ]

    let success = false
    let lastError: any = null
    for (const ep of endpoints) {
      try {
        console.log('[MuxAnalyticsChat] Attempting endpoint:', `${baseUrl}${ep}`)
        success = await streamFrom(ep)
        if (success) break
      } catch (e) {
        lastError = e
        console.warn('[MuxAnalyticsChat] Endpoint failed:', `${baseUrl}${ep}`, e)
      }
    }

    if (!success) {
      const errorMsg = lastError instanceof Error ? lastError.message : String(lastError)
      console.error('[MuxAnalyticsChat] All endpoints failed. Last error:', errorMsg)
      throw new Error(`Failed to get response: ${errorMsg}`)
    }
  }, [agent, messages])

  /**
   * Handles clicking a suggested option
   */
  const handleOptionClick = useCallback(async (optionText: string) => {
    if (!agent || isLoading) return

    // Stop voice recording if active
    if (isListening) {
      stopListening()
    }

    // Create messages immediately
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: optionText,
      timestamp: Date.now()
    }

    const assistantId = `assistant-${Date.now()}`
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    }

    // Set messages and state
    setMessages([userMsg, assistantMsg])
    setInput('')
    setStreamingContent('')
    setHasAssistantResponded(true)

    // Send the message with the new message history
    try {
      await sendMessage(optionText, [userMsg])
    } catch (error) {
      console.error('[MuxAnalyticsChat] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      setError(errorMessage)
      if (streamingContent.trim().length === 0) {
        setStreamingContent(`Error: ${errorMessage}`)
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
    }
  }, [agent, isLoading, isListening, stopListening, sendMessage, streamingContent])

  /**
   * Handles sending a message to the analytics agent
   */
  const onSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || !agent) return

    // Stop voice recording if active before sending message
    if (isListening) {
      console.log('[MuxAnalyticsChat] Stopping voice recording before sending message')
      stopListening()
    }

    setHasAssistantResponded(true)

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now()
    }

    const assistantId = `assistant-${Date.now()}`
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreamingContent('') // Reset streaming content for new message

    try {
      await sendMessage(trimmed)
    } catch (error) {
      console.error('[MuxAnalyticsChat] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      // Only surface error if we truly have no content
      setError(prev => prev || (streamingContent.trim().length === 0 ? errorMessage : null))
      if (streamingContent.trim().length === 0) {
        setStreamingContent(`Error: ${errorMessage}`)
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
    }
  }, [input, agent, hasAssistantResponded, isListening, stopListening, sendMessage, streamingContent, messages])

  // Handle streaming updates
  useEffect(() => {
    if (isStreaming && streamingContent && messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage.role === 'assistant') {
        // Update the last assistant message with streaming content
        setMessages(prev => {
          const updated = [...prev]
          const lastIndex = updated.length - 1
          if (updated[lastIndex].role === 'assistant') {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: streamingContent
            }
          }
          return updated
        })
      }
    }
  }, [isStreaming, streamingContent, messages.length]) // Only update when streaming content changes

  // Handle completion
  useEffect(() => {
    if (!isStreaming && !isLoading && hasAssistantResponded) {
      setHasAssistantResponded(false)
      setStreamingContent('') // Reset streaming content when done
    }
  }, [isStreaming, isLoading, hasAssistantResponded])

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h2 className="text-base font-semibold leading-tight" style={{ color: 'var(--fg)' }}>
            Paramount Plus Streaming Analytics
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--fg-muted)' }}>
            AI-powered video streaming analysis and optimization
          </p>
        </div>
        <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          {getDisplayHost()}
        </div>
      </div>

      {/* Agent Status */}
      {agentError && (
        <div className="px-2 py-1.5 rounded border text-xs" style={{ backgroundColor: 'var(--bg-soft)', borderColor: 'var(--border)' }}>
          <div style={{ color: 'var(--fg-muted)' }}>
            {agentError}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="px-2 py-1.5 rounded border text-xs" style={{ backgroundColor: 'var(--bg-soft)', borderColor: 'var(--border)' }}>
          <div className="text-red-600">
            Error: {error}
          </div>
        </div>
      )}

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 min-h-[400px] max-h-[70vh] chat-messages-container space-y-3 p-4 rounded-xl border overflow-y-auto"
        style={{ 
          backgroundColor: 'var(--bg-soft)', 
          borderColor: 'var(--border)'
        }}
      >
        {messages.length === 0 ? (
          <div className="text-center py-6 px-4">
            <p className="font-semibold text-sm mb-1" style={{ color: 'var(--fg)' }}>
              Welcome to Paramount Plus Streaming Analytics!
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--fg-muted)' }}>
              Click any option below to get started:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto">
              <button
                onClick={() => handleOptionClick('Analyze video streaming performance metrics including startup time, rebuffering, and segment delivery for the last 7 days. Include a chart if possible.')}
                disabled={!agent || isLoading}
                className="px-4 py-3 rounded-xl border text-left text-xs transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                style={{ 
                  backgroundColor: 'var(--bg)', 
                  borderColor: 'var(--border)',
                  color: 'var(--fg)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                📊 Video streaming performance metrics
              </button>
              <button
                onClick={() => handleOptionClick('Analyze error rates and playback issues for the last 7 days. Break down errors by platform and type. Include a chart showing error distribution.')}
                disabled={!agent || isLoading}
                className="px-4 py-3 rounded-xl border text-left text-xs transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                style={{ 
                  backgroundColor: 'var(--bg)', 
                  borderColor: 'var(--border)',
                  color: 'var(--fg)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                ⚠️ Error rates and playback issues
              </button>
              <button
                onClick={() => handleOptionClick('Analyze CDN performance and provide optimization recommendations. Include geographic distribution analysis and a chart of views by country.')}
                disabled={!agent || isLoading}
                className="px-4 py-3 rounded-xl border text-left text-xs transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                style={{ 
                  backgroundColor: 'var(--bg)', 
                  borderColor: 'var(--border)',
                  color: 'var(--fg)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                🚀 CDN optimization recommendations
              </button>
              <button
                onClick={() => handleOptionClick('Show user engagement analytics including viewer experience scores, watch time, and completion rates for the last 7 days.')}
                disabled={!agent || isLoading}
                className="px-4 py-3 rounded-xl border text-left text-xs transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                style={{ 
                  backgroundColor: 'var(--bg)', 
                  borderColor: 'var(--border)',
                  color: 'var(--fg)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                👥 User engagement analytics
              </button>
              <button
                onClick={() => handleOptionClick('Generate an audio report summarizing video analytics for the last 7 days')}
                disabled={!agent || isLoading}
                className="px-4 py-3 rounded-xl border text-left text-xs transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                style={{ 
                  backgroundColor: 'var(--bg)', 
                  borderColor: 'var(--border)',
                  color: 'var(--fg)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                🎵 Generate an audio report
              </button>
              <button
                onClick={() => handleOptionClick('List my top performing videos by views and engagement for the last 7 days. Include view counts and performance metrics.')}
                disabled={!agent || isLoading}
                className="px-4 py-3 rounded-xl border text-left text-xs transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                style={{ 
                  backgroundColor: 'var(--bg)', 
                  borderColor: 'var(--border)',
                  color: 'var(--fg)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                🏆 Top performing videos
              </button>
              <button
                onClick={() => handleOptionClick('Show video views and watch time statistics for the last 7 days. Include total views, watch time, and average session duration. Create a chart showing views over time.')}
                disabled={!agent || isLoading}
                className="px-4 py-3 rounded-xl border text-left text-xs transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                style={{ 
                  backgroundColor: 'var(--bg)', 
                  borderColor: 'var(--border)',
                  color: 'var(--fg)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                📈 Views and watch time statistics
              </button>
              <button
                onClick={() => handleOptionClick('Analyze video quality and bitrate performance including resolution distribution, bitrate adaptation, and quality metrics for the last 7 days.')}
                disabled={!agent || isLoading}
                className="px-4 py-3 rounded-xl border text-left text-xs transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                style={{ 
                  backgroundColor: 'var(--bg)', 
                  borderColor: 'var(--border)',
                  color: 'var(--fg)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                🎬 Video quality and bitrate analysis
              </button>
              <button
                onClick={() => handleOptionClick('Show geographic distribution of viewers for the last 7 days. Create a bar chart of views by country and a pie chart showing country distribution percentages.')}
                disabled={!agent || isLoading}
                className="px-4 py-3 rounded-xl border text-left text-xs transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                style={{ 
                  backgroundColor: 'var(--bg)', 
                  borderColor: 'var(--border)',
                  color: 'var(--fg)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                🌍 Geographic viewer distribution
              </button>
              <button
                onClick={() => handleOptionClick('Analyze devices and browsers used by viewers for the last 7 days. Break down by operating system, device type, and browser. Include charts.')}
                disabled={!agent || isLoading}
                className="px-4 py-3 rounded-xl border text-left text-xs transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                style={{ 
                  backgroundColor: 'var(--bg)', 
                  borderColor: 'var(--border)',
                  color: 'var(--fg)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                💻 Device and browser analytics
              </button>
              <button
                onClick={() => handleOptionClick('Show buffering and rebuffering metrics for the last 7 days. Include rebuffer percentage, frequency, and duration. Create a chart showing rebuffering trends over time.')}
                disabled={!agent || isLoading}
                className="px-4 py-3 rounded-xl border text-left text-xs transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                style={{ 
                  backgroundColor: 'var(--bg)', 
                  borderColor: 'var(--border)',
                  color: 'var(--fg)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                ⏱️ Buffering and rebuffering metrics
              </button>
              <button
                onClick={() => handleOptionClick('Create multiple charts showing video analytics trends for the last 7 days including views over time, error rates, and performance metrics comparison')}
                disabled={!agent || isLoading}
                className="px-4 py-3 rounded-xl border text-left text-xs transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                style={{ 
                  backgroundColor: 'var(--bg)', 
                  borderColor: 'var(--border)',
                  color: 'var(--fg)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                📊 Create analytics charts and graphs
              </button>
            </div>
            {isSpeechSupported && (
              <p className="mt-4 text-xs" style={{ color: 'var(--accent)' }}>
                🎤 Or click the microphone button to use voice input
              </p>
            )}
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-2.5 py-1.5 rounded-md group message-bubble ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white border'
                  }`}
                  style={{
                    backgroundColor: message.role === 'user' ? 'var(--accent)' : 'var(--bg)',
                    borderColor: message.role === 'assistant' ? 'var(--border)' : 'transparent',
                    color: message.role === 'user' ? 'var(--accent-contrast)' : 'var(--fg)'
                  }}
                >
                  <MessageComponent 
                    message={message} 
                    isStreaming={isStreaming && message.role === 'assistant' && message === messages[messages.length - 1]}
                  />
                </div>
              </div>
            ))}
            
            {/* Thinking Indicator */}
            {isLoading && !isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
              <div className="flex justify-start">
                <div
                  className="max-w-[85%] px-4 py-3 rounded-xl border shadow-sm"
                  style={{
                    backgroundColor: 'var(--bg-soft)',
                    borderColor: 'var(--border)',
                    color: 'var(--fg-muted)'
                  }}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <div className="flex gap-1">
                      <span className="animate-bounce text-xs" style={{ animationDelay: '0ms', color: 'var(--accent)' }}>●</span>
                      <span className="animate-bounce text-xs" style={{ animationDelay: '150ms', color: 'var(--accent)' }}>●</span>
                      <span className="animate-bounce text-xs" style={{ animationDelay: '300ms', color: 'var(--accent)' }}>●</span>
                    </div>
                    <span className="font-medium">Analyzing streaming data...</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Streaming Indicator */}
            {isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
              <div className="flex justify-start">
                <div
                  className="max-w-[85%] px-4 py-3 rounded-xl border-2 shadow-sm"
                  style={{
                    backgroundColor: 'var(--accent-muted)',
                    borderColor: 'var(--accent)',
                    borderWidth: '2px'
                  }}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent)' }}></div>
                    <span className="font-medium" style={{ color: 'var(--fg)' }}>Generating response...</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-1.5">
        <div className="flex-1 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onSend()}
            placeholder="Ask about streaming analytics..."
            className="w-full px-2.5 py-1.5 pr-10 rounded border text-xs"
            style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--fg)' }}
            disabled={!agent || isLoading}
          />
          {/* Microphone button */}
          {isSpeechSupported && (
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={!agent || isLoading}
              className={`absolute right-1 top-1/2 transform -translate-y-1/2 p-1 rounded transition-all duration-200 ${
                isListening 
                  ? 'animate-pulse' 
                  : 'hover:scale-105'
              } disabled:opacity-50`}
              style={{ 
                backgroundColor: isListening ? 'var(--error)' : 'var(--accent)', 
                color: 'var(--accent-contrast)',
                border: isListening ? '2px solid var(--error)' : 'none'
              }}
              title={isListening ? 'Stop recording' : 'Start voice input'}
            >
              {isListening ? (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              )}
            </button>
          )}
        </div>
        <button
          onClick={onSend}
          disabled={!agent || isLoading || !input.trim()}
          className="px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>

      {/* Speech recognition status */}
      {isListening && (
        <div className="flex items-center gap-1.5 text-xs px-1" style={{ color: 'var(--fg-muted)' }}>
          <div className="animate-pulse w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--error)' }}></div>
          <span>Listening... {transcript && `"${transcript}"`}</span>
        </div>
      )}
      
      {speechError && (
        <div className="text-xs text-red-600 px-1">
          Speech error: {speechError}
        </div>
      )}

      {/* Status */}
      <div className="text-[10px] text-center px-1" style={{ color: 'var(--fg-muted)' }}>
        {isLoading && !isStreaming && 'Fetching analytics data from Mux...'}
        {isStreaming && 'Streaming response...'}
        {!isLoading && !isStreaming && agent && (
          <>
            Ready to analyze streaming data
            {isSpeechSupported && ' • Voice input available'}
          </>
        )}
        {!agent && !agentError && 'Initializing agent...'}
      </div>
    </div>
  )
}