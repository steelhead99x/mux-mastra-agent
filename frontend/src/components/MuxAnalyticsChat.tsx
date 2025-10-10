import { useCallback, useMemo, useRef, useState, useEffect, memo } from 'react'
import { mastra, getMuxAnalyticsAgentId, getDisplayHost } from '../lib/mastraClient'
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
  stream: (message: string, options?: Record<string, unknown>) => Promise<any>
}

/**
 * Memoized message component to prevent unnecessary re-renders
 * @param message - The message to display
 * @param isStreaming - Whether the message is currently being streamed
 */
const MessageComponent = memo(({ message, isStreaming = false }: { message: Message; isStreaming?: boolean }) => {
  const { setCurrentVideo } = useMuxAnalytics()
  // Function to detect and extract Mux video URLs
  const detectMuxVideo = (content: string) => {
    // More comprehensive pattern that handles various URL formats and spacing issues
    const patterns = [
      // Standard format with potential spacing issues
      /https:\s*:\s*\/\s*\/\s*streamingportfolio\s*\.\s*com\s*\/\s*player\s*\?\s*assetId\s*=\s*([a-zA-Z0-9]+)/g,
      // Clean standard format
      /https:\/\/streamingportfolio\.com\/player\?assetId=([a-zA-Z0-9]+)/g,
      // With additional parameters
      /https:\/\/streamingportfolio\.com\/player\?assetId=([a-zA-Z0-9]+)(?:&[^\\s]*)?/g,
      // With playbackId parameter (alternative format)
      /https:\/\/streamingportfolio\.com\/player\?playbackId=([a-zA-Z0-9]+)/g,
      // Handle URLs with line breaks or special characters
      /https:\/\/streamingportfolio\.com\/player\?assetId=([a-zA-Z0-9]+)(?:\s|$)/g,
      // New .html format patterns
      /https:\/\/streamingportfolio\.com\/player\.html\?assetId=([a-zA-Z0-9]+)/g,
      /https:\/\/streamingportfolio\.com\/player\.html\?assetId=([a-zA-Z0-9]+)(?:&[^\\s]*)?/g,
      /https:\/\/streamingportfolio\.com\/player\.html\?playbackId=([a-zA-Z0-9]+)/g,
      /https:\/\/streamingportfolio\.com\/player\.html\?assetId=([a-zA-Z0-9]+)(?:\s|$)/g,
      // www subdomain patterns
      /https:\/\/www\.streamingportfolio\.com\/player\?assetId=([a-zA-Z0-9]+)/g,
      /https:\/\/www\.streamingportfolio\.com\/player\?assetId=([a-zA-Z0-9]+)(?:&[^\\s]*)?/g,
      /https:\/\/www\.streamingportfolio\.com\/player\?playbackId=([a-zA-Z0-9]+)/g,
      /https:\/\/www\.streamingportfolio\.com\/player\.html\?assetId=([a-zA-Z0-9]+)/g,
      /https:\/\/www\.streamingportfolio\.com\/player\.html\?assetId=([a-zA-Z0-9]+)(?:&[^\\s]*)?/g,
      /https:\/\/www\.streamingportfolio\.com\/player\.html\?playbackId=([a-zA-Z0-9]+)/g,
      /https:\/\/www\.streamingportfolio\.com\/player\.html\?assetId=([a-zA-Z0-9]+)(?:\s|$)/g
    ];
    
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        // Clean up the URL by removing any extra spaces and normalize
        const cleanUrl = matches[0].replace(/\s+/g, '').trim();
        console.log('[detectMuxVideo] Found URL:', cleanUrl);
        return cleanUrl;
      }
    }
    
    return null;
  }

  // Function to detect and extract image URLs
  const detectImageUrl = (content: string) => {
    const imagePattern = /https:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg)(?:\?[^\s]*)?/gi;
    const matches = content.match(imagePattern);
    return matches ? matches[0] : null;
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
      // Extract assetId or playbackId from URL
      const url = new URL(muxVideoUrl)
      const assetId = url.searchParams.get('assetId')
      const playbackId = url.searchParams.get('playbackId')
      
      // Use assetId if available, otherwise fallback to playbackId
      const idToUse = assetId || playbackId
      
      if (idToUse) {
        // Update the main player with this video
        setCurrentVideo({
          assetId: assetId || undefined,
          playbackId: playbackId || undefined
        })
        
        // Remove the video URL from the text content
        const textContent = content.replace(muxVideoUrl, '').trim()
        
        return (
          <div className="space-y-3">
            {/* Render text content first */}
            {textContent && (
              <div className="prose prose-sm max-w-none chat-message">
                <div className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">
                  {formatTextContent(textContent)}
                </div>
              </div>
            )}
            {/* Show notification that audio is loaded in the main player */}
            <div className="mt-3 p-4 rounded-lg border" style={{ 
              backgroundColor: 'var(--overlay)', 
              borderColor: 'var(--accent)',
              borderWidth: '2px'
            }}>
              <div className="flex items-start gap-3">
                <div className="text-2xl">🎧</div>
                <div className="flex-1">
                  <div className="font-medium mb-1" style={{ color: 'var(--fg)' }}>
                    Audio Report Loaded
                  </div>
                  <div className="text-sm mb-2" style={{ color: 'var(--fg-muted)' }}>
                    Your audio report is now playing in the player on the left. Click play to listen.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(muxVideoUrl).then(() => {
                          // Show temporary success feedback
                          const button = event?.target as HTMLButtonElement;
                          const originalText = button.textContent;
                          button.textContent = '✓ Copied!';
                          setTimeout(() => {
                            button.textContent = originalText;
                          }, 2000);
                        }).catch(err => {
                          console.error('Failed to copy URL:', err);
                        });
                      }}
                      className="text-xs px-3 py-1.5 rounded border transition-colors hover:bg-opacity-80"
                      style={{ 
                        backgroundColor: 'var(--accent)', 
                        borderColor: 'var(--accent)',
                        color: 'var(--accent-contrast)'
                      }}
                    >
                      Copy Player URL
                    </button>
                    <a 
                      href={muxVideoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-3 py-1.5 rounded border transition-colors hover:bg-opacity-80"
                      style={{ 
                        backgroundColor: 'var(--bg)', 
                        borderColor: 'var(--border)',
                        color: 'var(--fg)',
                        textDecoration: 'none'
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
    }

    // Check for image URL
    const imageUrl = detectImageUrl(content)
    if (imageUrl) {
      const textContent = content.replace(imageUrl, '').trim()
      return (
        <div className="space-y-3">
          {textContent && (
            <div className="prose prose-sm max-w-none chat-message">
              <div className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">
                {formatTextContent(textContent)}
              </div>
            </div>
          )}
          <div className="mt-3">
            <img 
              src={imageUrl} 
              alt="Content image" 
              className="max-w-full h-auto rounded-lg border"
              style={{ borderColor: 'var(--border)' }}
              onError={(e) => {
                console.warn('Failed to load image:', imageUrl);
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        </div>
      )
    }

    // Default text rendering
    return (
      <div className="prose prose-sm max-w-none chat-message">
        <div className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">
          {formatTextContent(content)}
        </div>
      </div>
    )
  }

  return (
    <div className="whitespace-pre-wrap text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
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
                button.textContent = 'Copied!';
                button.style.color = 'var(--success)';
                setTimeout(() => {
                  button.textContent = originalText;
                  button.style.color = '';
                }, 2000);
              }).catch(err => {
                console.error('Failed to copy message:', err);
              });
            }}
            className="text-xs px-2 py-1 rounded border transition-colors hover:bg-opacity-80 opacity-0 group-hover:opacity-100"
            style={{ 
              backgroundColor: 'var(--accent)', 
              borderColor: 'var(--accent)',
              color: 'var(--accent-fg)'
            }}
            title="Copy message text"
          >
            Copy Text
          </button>
        )}
      </div>
      <div className="text-xs mt-1 opacity-70">
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

  // Auto-scroll to bottom when new messages arrive with smooth behavior
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      })
    }
  }, [])

  // Initial scroll without animation when messages change significantly
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('auto')
    }
  }, [messages.length, scrollToBottom])

  // Smooth scroll during streaming with throttling
  useEffect(() => {
    if (isStreaming) {
      const timeoutId = setTimeout(() => scrollToBottom('smooth'), 50)
      return () => clearTimeout(timeoutId)
    }
  }, [streamingContent, isStreaming, scrollToBottom])

  /**
   * Handles sending a message to the analytics agent
   */
  const onSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || !agent) return

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
      setIsLoading(true)
      setIsStreaming(true)
      setError(null)
      setStreamingContent('')
      
      console.log('[MuxAnalyticsChat] Sending message:', trimmed)
      
      // Convert our message history to the format expected by the agent
      const messageHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
      
      // Add the new user message
      messageHistory.push({ role: 'user', content: trimmed })
      
      // Try direct API call first to get raw streaming response
      try {
        
        const response = await fetch('/api/agents/mux-analytics/streamVNext', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: messageHistory
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        console.log('[MuxAnalyticsChat] Direct API response received, processing stream...')
        
        // Handle streaming response
        const reader = response.body?.getReader()
        if (reader) {
          const decoder = new TextDecoder()
          let fullContent = ''
          
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              
              const chunk = decoder.decode(value, { stream: true })
              if (chunk) {
                fullContent += chunk
                setStreamingContent(fullContent)
                console.log('[MuxAnalyticsChat] Streamed chunk:', chunk.length, 'chars')
              }
            }
            console.log('[MuxAnalyticsChat] Final content length:', fullContent.length)
          } finally {
            reader.releaseLock()
          }
        } else {
          // Fallback to text response
          const textContent = await response.text()
          setStreamingContent(textContent)
          console.log('[MuxAnalyticsChat] Text content length:', textContent.length)
        }
      } catch (apiError) {
        console.warn('[MuxAnalyticsChat] Direct API failed, trying MastraClient:', apiError)
        
        // Fallback to MastraClient
        const response = await agent.stream(messageHistory)
        
        console.log('[MuxAnalyticsChat] Received MastraClient response:', response)
        
        // Handle streaming response
        if (response.textStream) {
          console.log('[MuxAnalyticsChat] Processing textStream...')
          let fullContent = ''
          for await (const chunk of response.textStream) {
            if (chunk && typeof chunk === 'string') {
              fullContent += chunk
              setStreamingContent(fullContent)
              console.log('[MuxAnalyticsChat] Streamed chunk:', chunk.length, 'chars')
            }
          }
          console.log('[MuxAnalyticsChat] Final content length:', fullContent.length)
        } else if (response.text) {
          console.log('[MuxAnalyticsChat] Processing text response...')
          // Handle non-streaming response
          const textContent = typeof response.text === 'function' ? await response.text() : response.text
          setStreamingContent(textContent)
          console.log('[MuxAnalyticsChat] Text content length:', textContent.length)
        } else if (response.processDataStream) {
          console.log('[MuxAnalyticsChat] Processing processDataStream...')
          // Handle Mastra's processDataStream format
          let fullContent = ''
          await response.processDataStream({
            onChunk: async (chunk: any) => {
              if (chunk && chunk.content) {
                fullContent += chunk.content
                setStreamingContent(fullContent)
                console.log('[MuxAnalyticsChat] Processed chunk:', chunk.content.length, 'chars')
              }
            }
          })
          console.log('[MuxAnalyticsChat] Processed content length:', fullContent.length)
        } else {
          console.warn('[MuxAnalyticsChat] No recognized response format:', Object.keys(response))
          // Try to extract any text content from the response
          const responseText = response.toString() || JSON.stringify(response)
          setStreamingContent(responseText)
        }
      }
    } catch (error) {
      console.error('[MuxAnalyticsChat] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      setError(errorMessage)
      setStreamingContent(`Error: ${errorMessage}`)
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
    }
  }, [input, agent, hasAssistantResponded])

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
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--fg)' }}>
            Paramount Plus Streaming Analytics
          </h2>
          <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
            AI-powered video streaming analysis and optimization
          </p>
        </div>
        <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          {getDisplayHost()}
        </div>
      </div>

      {/* Agent Status */}
      {agentError && (
        <div className="p-3 rounded-lg border" style={{ backgroundColor: 'var(--bg-soft)', borderColor: 'var(--border)' }}>
          <div className="text-sm" style={{ color: 'var(--fg-muted)' }}>
            {agentError}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 rounded-lg border" style={{ backgroundColor: 'var(--bg-soft)', borderColor: 'var(--border)' }}>
          <div className="text-sm text-red-600">
            Error: {error}
          </div>
        </div>
      )}

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 min-h-[400px] max-h-[70vh] chat-messages-container space-y-4 p-4 rounded-lg border overflow-y-auto"
        style={{ 
          backgroundColor: 'var(--bg-soft)', 
          borderColor: 'var(--border)',
          scrollBehavior: 'smooth',
          overflowAnchor: 'none'
        }}
      >
        {messages.length === 0 ? (
          <div className="text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
            <p>Welcome to Paramount Plus Streaming Analytics!</p>
            <p className="mt-2">Ask me about:</p>
            <ul className="mt-2 space-y-1 text-left max-w-md mx-auto">
              <li>• Video streaming performance metrics</li>
              <li>• Error rates and playback issues</li>
              <li>• CDN optimization recommendations</li>
              <li>• User engagement analytics</li>
              <li>• Generate an audio report</li>
            </ul>
            {isSpeechSupported && (
              <p className="mt-3 text-xs" style={{ color: 'var(--accent)' }}>
                🎤 Click the microphone button to use voice input
              </p>
            )}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg group message-bubble ${
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
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onSend()}
            placeholder="Ask about streaming analytics..."
            className="w-full p-3 pr-12 rounded-lg border text-sm"
            style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--fg)' }}
            disabled={!agent || isLoading}
          />
          {/* Microphone button */}
          {isSpeechSupported && (
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={!agent || isLoading}
              className={`absolute right-2 top-1/2 transform -translate-y-1/2 p-2 rounded-lg transition-all duration-200 ${
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
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
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
          className="px-4 py-3 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>

      {/* Speech recognition status */}
      {isListening && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--fg-muted)' }}>
          <div className="animate-pulse w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--error)' }}></div>
          <span>Listening... {transcript && `"${transcript}"`}</span>
        </div>
      )}
      
      {speechError && (
        <div className="text-sm text-red-600">
          Speech error: {speechError}
        </div>
      )}

      {/* Status */}
      <div className="text-xs text-center" style={{ color: 'var(--fg-muted)' }}>
        {isLoading && 'Processing your request...'}
        {isStreaming && 'Streaming response...'}
        {!isLoading && !isStreaming && agent && (
          <>
            Ready to analyze streaming data
            {isSpeechSupported && ' • Voice input available'}
          </>
        )}
      </div>
    </div>
  )
}