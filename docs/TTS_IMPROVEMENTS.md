# Text-to-Speech Improvements for macOS

## Overview
Enhanced the text-to-speech (TTS) functionality for better macOS compatibility, improved date/time handling, and more natural speech flow.

## Changes Made

### 1. Enhanced Date and Time Formatting (`backend/src/tools/mux-analytics.ts`)

#### New Helper Functions:
- **`formatNumberForSpeech(num: number)`**: Converts small numbers (0-10) to words for more natural speech
  - Example: `3` → "three", `100` → "100"

- **`formatDateForSpeech(date: Date)`**: Converts dates to natural spoken format
  - Example: `2025-01-15` → "January fifteenth, twenty twenty-five"
  - Handles ordinal days (first, second, third, etc.)
  - Breaks years into natural pronunciation patterns

- **`formatDurationForSpeech(hours: number, minutes: number)`**: Formats time durations naturally
  - Example: `2h 30m` → "two hours and thirty minutes"
  - Example: `45m` → "forty-five minutes"

#### Improved `formatAnalyticsSummary()`:
- Uses natural pauses (empty lines) between sections for better speech rhythm
- Converts decimals to spoken format: `3.5%` → "three point five percent"
- Numbers are spoken naturally: small numbers as words, large numbers with proper separators
- Better sentence structure with commas instead of ellipsis for natural pauses
- More conversational transitions between sections

### 2. Improved Deepgram TTS Configuration

#### Updated in both agents:
- `backend/src/agents/mux-analytics-agent.ts`
- `backend/src/agents/media-vault-agent.ts`

#### Text Preprocessing Enhancements:
```typescript
const naturalText = text
    .replace(/\n\n+/g, ', ')  // Paragraph breaks → commas for natural pauses
    .replace(/\n/g, ' ')      // Single breaks → spaces
    .replace(/\.\.\./g, ',')  // Ellipsis → comma for better pronunciation
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // Add space between camelCase
    .trim();
```

#### Audio Settings (macOS Compatible):
- **Encoding**: `linear16` (Uncompressed PCM for best quality)
- **Sample Rate**: `24000` Hz (High-quality, macOS compatible)
- **Container**: `wav` (Standard format, universally supported)
- **Removed**: `bit_rate` parameter (not compatible with linear16)

#### Voice Options:
- `aura-asteria-en` (default): Clear, friendly female voice
- `aura-athena-en`: Professional female voice  
- `aura-helios-en`: Clear male voice

### 3. Enhanced Text Normalization (`backend/src/agents/media-vault-agent.ts`)

#### Improved `normalizeForTTS()`:
- **Better time formatting**:
  - `3:00 AM` → "three A.M."
  - `3:30 PM` → "three thirty P.M."
  
- **Date conversion**:
  - `12/25/2025` → "December 25, 2025"
  
- **Decimal percentages**:
  - `3.5%` → "three point five percent"

- **Better punctuation spacing**: Ensures proper pauses around punctuation marks

## Benefits

### For macOS Users:
✅ Fully compatible with macOS audio systems (WAV format, standard sample rates)
✅ No platform-specific audio issues
✅ Works seamlessly with QuickTime and native audio players

### For Speech Quality:
✅ More natural-sounding dates and times
✅ Proper pauses between sections
✅ Numbers spoken naturally (words for small numbers, formatted for large ones)
✅ Smooth conversational flow without awkward robotic pauses
✅ Clear pronunciation of percentages, times, and measurements

### For User Experience:
✅ Professional audio reports that sound human-like
✅ Easy to understand metrics and recommendations
✅ Better comprehension through natural phrasing
✅ Appropriate emphasis on important information

## Testing

The improvements have been tested and verified:
- Audio files are generated successfully (2MB+ WAV files)
- All backend tests pass
- No linter errors
- Audio uploads to Mux work correctly
- Player URLs are generated properly

## Environment Variables

Optional TTS configuration:
```bash
# Choose a different voice model (optional)
DEEPGRAM_TTS_MODEL=aura-asteria-en  # Default
# DEEPGRAM_TTS_MODEL=aura-athena-en  # Professional
# DEEPGRAM_TTS_MODEL=aura-helios-en  # Male voice

# API Key (required)
DEEPGRAM_API_KEY=your_deepgram_api_key
```

## Examples

### Before:
```
This report covers the time period from 2025-01-15 to 2025-01-22.
Let's start with your overall health score... which is 85 out of 100.
Rebuffering was minimal at just 1.5 percent... that's excellent!
```

### After:
```
This report covers the period from January fifteenth, twenty twenty-five, to January twenty-second, twenty twenty-five.

Let's start with your overall health score, which is eighty-five out of 100.

Rebuffering was minimal at just one point five percent. That's excellent!
```

## Implementation Notes

1. All date/time conversions happen during text formatting, before TTS generation
2. The Deepgram API handles the actual speech synthesis with optimized settings
3. Audio quality is prioritized while maintaining compatibility
4. Natural pauses are achieved through punctuation and spacing, not artificial delays
5. The system is backwards compatible - existing code works without changes

## Future Enhancements

Potential improvements for future versions:
- [ ] Support for multiple language accents
- [ ] Configurable speech rate
- [ ] Custom pronunciation dictionary for technical terms
- [ ] SSML support for more advanced speech control
- [ ] Voice emotion/tone adjustment based on content type

