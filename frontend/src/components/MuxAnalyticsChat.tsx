import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { mastra, getMuxAnalyticsAgentId, getDisplayHost } from '../lib/mastraClient'
import { useStreamVNext } from '../hooks/useStreamVNext'
import type { StreamChunk } from '../types/streamVNext'
import MuxSignedPlayer from './MuxSignedPlayer'
import { useMuxAnalytics } from '../contexts/MuxAnalyticsContext'

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
  streamVNext: (message: string, options?: Record<string, unknown>) => Promise<any>
}

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

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Auto-scroll with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(scrollToBottom, 100)
    return () => clearTimeout(timeoutId)
  }, [messages, scrollToBottom])

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
      
      // Try direct API call first to get raw streaming response
      try {
        const response = await fetch('/api/agents/mux-analytics/streamVNext', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: trimmed }]
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
        const response = await agent.streamVNext([{ role: 'user', content: trimmed }])
        
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
        className="flex-1 min-h-[400px] max-h-[600px] overflow-y-auto space-y-4 p-4 rounded-lg border"
        style={{ backgroundColor: 'var(--bg-soft)', borderColor: 'var(--border)' }}
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
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white border'
                }`}
                style={{
                  backgroundColor: message.role === 'user' ? 'var(--primary)' : 'var(--bg)',
                  borderColor: message.role === 'assistant' ? 'var(--border)' : 'transparent',
                  color: message.role === 'user' ? 'white' : 'var(--fg)'
                }}
              >
                <div className="whitespace-pre-wrap text-sm">
                  {message.content}
                </div>
                <div className="text-xs mt-1 opacity-70">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && onSend()}
          placeholder="Ask about streaming analytics..."
          className="flex-1 p-3 rounded-lg border text-sm"
          style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--fg)' }}
          disabled={!agent || isLoading}
        />
        <button
          onClick={onSend}
          disabled={!agent || isLoading || !input.trim()}
          className="px-4 py-3 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--primary)', color: 'white' }}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>

      {/* Status */}
      <div className="text-xs text-center" style={{ color: 'var(--fg-muted)' }}>
        {isLoading && 'Processing your request...'}
        {isStreaming && 'Streaming response...'}
        {!isLoading && !isStreaming && agent && 'Ready to analyze streaming data'}
      </div>
    </div>
  )
}