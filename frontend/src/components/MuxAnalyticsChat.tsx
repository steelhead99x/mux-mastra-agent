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
  streamVNext: (message: string, options?: Record<string, unknown>) => Promise<{
    textStream?: AsyncIterable<string>
    fullStream?: AsyncIterable<StreamChunk>
  }>
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

  // Enhanced streamVNext hook with better error handling
  const { state, streamVNext } = useStreamVNext({
    maxRetries: 3,
    timeout: 30000,
    enableMetrics: true,
    onChunk: (chunk) => {
      if (chunk.type === 'text' && chunk.content) {
        setStreamingContent(prev => prev + chunk.content)
      }
    }
  })

  const { isLoading, error, isStreaming } = state

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
      // Use the agent's streamVNext method directly
      const response = await agent.streamVNext([{ role: 'user', content: trimmed }])
      
      // Handle streaming response
      if (response.textStream) {
        let fullContent = ''
        for await (const chunk of response.textStream) {
          if (chunk && typeof chunk === 'string') {
            fullContent += chunk
            setStreamingContent(fullContent)
          }
        }
      } else if (response.text) {
        // Handle non-streaming response
        setStreamingContent(response.text)
      }
    } catch (error) {
      console.error('[MuxAnalyticsChat] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      setStreamingContent(`Error: ${errorMessage}`)
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