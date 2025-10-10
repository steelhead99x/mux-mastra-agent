import { useState, useRef, useCallback } from 'react'

// Add type declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

interface SpeechToTextOptions {
  onTranscription?: (text: string) => void
  onError?: (error: string) => void
  onStart?: () => void
  onStop?: () => void
}

interface SpeechToTextState {
  isListening: boolean
  isSupported: boolean
  transcript: string
  error: string | null
}

export function useSpeechToText(options: SpeechToTextOptions = {}) {
  const [state, setState] = useState<SpeechToTextState>({
    isListening: false,
    isSupported: 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
    transcript: '',
    error: null
  })

  const recognitionRef = useRef<any | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const startListening = useCallback(async () => {
    if (!state.isSupported) {
      const error = 'Speech recognition is not supported in this browser'
      setState(prev => ({ ...prev, error }))
      options.onError?.(error)
      return
    }

    try {
      // Try Web Speech API first (faster, client-side)
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
        const recognition = new SpeechRecognition()
        
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'

        recognition.onstart = () => {
          setState(prev => ({ 
            ...prev, 
            isListening: true, 
            error: null,
            transcript: ''
          }))
          options.onStart?.()
        }

        recognition.onresult = (event: any) => {
          let finalTranscript = ''
          let interimTranscript = ''

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalTranscript += transcript
            } else {
              interimTranscript += transcript
            }
          }

          const fullTranscript = finalTranscript + interimTranscript
          setState(prev => ({ ...prev, transcript: fullTranscript }))
          
          if (finalTranscript) {
            options.onTranscription?.(finalTranscript)
          }
        }

        recognition.onerror = (event: any) => {
          const error = `Speech recognition error: ${event.error}`
          setState(prev => ({ ...prev, error, isListening: false }))
          options.onError?.(error)
        }

        recognition.onend = () => {
          setState(prev => ({ ...prev, isListening: false }))
          options.onStop?.()
        }

        recognitionRef.current = recognition
        recognition.start()
      } else {
        // Fallback to Deepgram API via backend
        await startDeepgramRecording()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start speech recognition'
      setState(prev => ({ ...prev, error: errorMessage, isListening: false }))
      options.onError?.(errorMessage)
    }
  }, [state.isSupported, options])

  const startDeepgramRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await sendToDeepgram(audioBlob)
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder

      setState(prev => ({ 
        ...prev, 
        isListening: true, 
        error: null,
        transcript: ''
      }))
      options.onStart?.()

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to access microphone'
      setState(prev => ({ ...prev, error: errorMessage, isListening: false }))
      options.onError?.(errorMessage)
    }
  }

  const sendToDeepgram = async (audioBlob: Blob) => {
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      const response = await fetch('/api/speech-to-text', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      
      if (result.transcript) {
        setState(prev => ({ ...prev, transcript: result.transcript }))
        options.onTranscription?.(result.transcript)
      } else {
        throw new Error('No transcript received from server')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to transcribe audio'
      setState(prev => ({ ...prev, error: errorMessage }))
      options.onError?.(errorMessage)
    }
  }

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }

    setState(prev => ({ ...prev, isListening: false }))
    options.onStop?.()
  }, [options])

  const clearTranscript = useCallback(() => {
    setState(prev => ({ ...prev, transcript: '', error: null }))
  }, [])

  return {
    ...state,
    startListening,
    stopListening,
    clearTranscript
  }
}
