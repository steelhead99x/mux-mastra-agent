import express from 'express'
import multer from 'multer'
import { createClient } from '@deepgram/sdk'

const router = express.Router()

// Configure multer for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
})

// Initialize Deepgram client
const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '')

/**
 * POST /api/speech-to-text
 * Convert audio file to text using Deepgram
 */
router.post('/speech-to-text', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' })
    }

    if (!process.env.DEEPGRAM_API_KEY) {
      return res.status(500).json({ error: 'Deepgram API key not configured' })
    }

    // Convert buffer to readable stream
    const audioBuffer = req.file.buffer
    const audioStream = new ReadableStream({
      start(controller) {
        controller.enqueue(audioBuffer)
        controller.close()
      }
    })

    // Transcribe audio using Deepgram
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioStream,
      {
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        punctuate: true,
        paragraphs: true,
        utterances: true,
        diarize: false,
        multichannel: false,
        alternatives: 1,
        detect_language: false,
        filler_words: false,
        profanity_filter: false,
        redact: false,
        search: [],
        replace: [],
        keywords: [],
        callback: undefined,
        keywords_boost: 'default',
        encoding: 'webm',
        channels: 1,
        sample_rate: 48000,
      }
    )

    if (error) {
      console.error('Deepgram error:', error)
      return res.status(500).json({ error: 'Speech recognition failed', details: error.message })
    }

    if (!result || !result.results || !result.results.channels || result.results.channels.length === 0) {
      return res.status(400).json({ error: 'No speech detected in audio' })
    }

    // Extract transcript from the first channel
    const transcript = result.results.channels[0].alternatives[0]?.transcript || ''
    
    if (!transcript.trim()) {
      return res.status(400).json({ error: 'No speech content detected' })
    }

    res.json({
      transcript: transcript.trim(),
      confidence: result.results.channels[0].alternatives[0]?.confidence || 0,
      duration: result.metadata?.duration || 0,
      words: result.results.channels[0].alternatives[0]?.words || []
    })

  } catch (error) {
    console.error('Speech-to-text error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    res.status(500).json({ error: 'Speech recognition failed', details: errorMessage })
  }
})

export default router
