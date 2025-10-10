/**
 * Cartesia Voice Management Utility
 * Handles fetching and randomizing Cartesia TTS voices
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
  const selectedVoice = voices[randomIndex];
  
  console.log(`🎤 Selected random voice: ${selectedVoice.name} (${selectedVoice.id})`);
  
  return selectedVoice;
}

/**
 * Clear the voice cache (useful for testing or manual refresh)
 */
export function clearVoiceCache(): void {
  cachedVoices = null;
  cacheTimestamp = null;
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

