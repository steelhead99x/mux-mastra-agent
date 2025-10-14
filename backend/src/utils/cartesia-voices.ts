/**
 * Cartesia Voice Management Utility
 * Handles fetching and randomizing Cartesia TTS voices
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Voice caching with 1-hour TTL to minimize API calls
 * - Pre-selected voice stored in memory for instant access
 * - Pre-warming at startup eliminates first-request latency
 * - Synchronous voice check for zero-overhead validation
 */

import { CartesiaClient } from '@cartesia/cartesia-js';

export interface CartesiaVoice {
  id: string;
  name: string;
  description?: string;
  language?: string;
}

let cachedVoices: CartesiaVoice[] | null = null;
let cacheTimestamp: number | null = null;
let selectedVoice: CartesiaVoice | null = null; // Pre-selected voice for faster responses
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

/**
 * Fetch all available voices from Cartesia API
 */
export async function fetchCartesiaVoices(apiKey: string): Promise<CartesiaVoice[]> {
  try {
    const client = new CartesiaClient({ apiKey });
    
    // Get voices from Cartesia API
    const voices = await client.voices.list();
    
    return voices.map((voice: any) => ({
      id: voice.id,
      name: voice.name,
      description: voice.description || '',
      language: voice.language || 'en'
    }));
  } catch (error) {
    console.error('Failed to fetch Cartesia voices:', error);
    throw new Error(`Failed to fetch voices: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get all US English voices with caching
 */
export async function getUSEnglishVoices(apiKey: string): Promise<CartesiaVoice[]> {
  const now = Date.now();
  
  // Return cached voices if available and not expired
  if (cachedVoices && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedVoices;
  }
  
  // Fetch fresh voices
  const allVoices = await fetchCartesiaVoices(apiKey);
  
  // Filter for English voices
  // Cartesia voice IDs and names that are known to be US English
  const usEnglishVoices = allVoices.filter(voice => {
    const lang = voice.language?.toLowerCase() || '';
    const name = voice.name?.toLowerCase() || '';
    const desc = voice.description?.toLowerCase() || '';
    
    // Filter for English voices
    return lang.includes('en') || 
           name.includes('english') || 
           desc.includes('english') ||
           !lang; // Include voices without language specified (most are English)
  });
  
  // Cache the results
  cachedVoices = usEnglishVoices;
  cacheTimestamp = now;
  
  console.log(`✅ Loaded ${usEnglishVoices.length} US English voices from Cartesia`);
  
  return usEnglishVoices;
}

/**
 * Get a random US English voice
 */
export async function getRandomUSEnglishVoice(apiKey: string): Promise<CartesiaVoice> {
  const voices = await getUSEnglishVoices(apiKey);
  
  if (voices.length === 0) {
    throw new Error('No US English voices available');
  }
  
  // Select a random voice
  const randomIndex = Math.floor(Math.random() * voices.length);
  const voice = voices[randomIndex];
  
  console.log(`🎤 Selected random voice: ${voice.name} (${voice.id})`);
  
  return voice;
}

/**
 * Check if a voice is already selected (synchronous, zero overhead)
 * Useful for optimization checks before async operations
 */
export function hasPreSelectedVoice(): boolean {
  return selectedVoice !== null;
}

/**
 * Get the pre-selected voice synchronously (returns null if not yet selected)
 * Use this for hot paths where you need immediate access
 */
export function getPreSelectedVoiceSync(): CartesiaVoice | null {
  return selectedVoice;
}

/**
 * Get pre-selected voice (fast, no API call needed)
 * If no voice is pre-selected, falls back to random selection
 * OPTIMIZED: Returns immediately if voice is already cached
 */
export async function getPreSelectedVoice(apiKey: string): Promise<CartesiaVoice> {
  if (selectedVoice) {
    // Fast path: voice already selected, return immediately (no API call)
    return selectedVoice;
  }
  
  // First time - select and cache (only happens once at startup)
  console.log('⚡ First-time voice selection...');
  selectedVoice = await getRandomUSEnglishVoice(apiKey);
  console.log(`✅ Voice cached for future use: ${selectedVoice.name}`);
  return selectedVoice;
}

/**
 * Pre-warm the voice selection at startup (non-blocking)
 * This should be called when the agent initializes
 */
export async function prewarmVoiceSelection(apiKey: string): Promise<void> {
  try {
    console.log('🔥 Pre-warming voice selection...');
    selectedVoice = await getRandomUSEnglishVoice(apiKey);
    console.log(`✅ Voice pre-selected at startup: ${selectedVoice.name}`);
  } catch (error) {
    console.warn('⚠️ Failed to pre-warm voice selection:', error);
    // Non-fatal - will fall back to on-demand selection
  }
}

/**
 * Clear the voice cache (useful for testing or manual refresh)
 */
export function clearVoiceCache(): void {
  cachedVoices = null;
  cacheTimestamp = null;
  selectedVoice = null;
  console.log('🗑️ Voice cache cleared');
}

/**
 * Get voice by ID or fall back to random
 */
export async function getVoiceById(apiKey: string, voiceId?: string): Promise<CartesiaVoice> {
  if (voiceId) {
    const voices = await getUSEnglishVoices(apiKey);
    const voice = voices.find(v => v.id === voiceId);
    
    if (voice) {
      console.log(`🎤 Using specified voice: ${voice.name} (${voice.id})`);
      return voice;
    }
    
    console.warn(`⚠️ Voice ID ${voiceId} not found, using random voice`);
  }
  
  return getRandomUSEnglishVoice(apiKey);
}

