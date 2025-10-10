import React from 'react';

/**
 * Enhanced text formatting utility that detects and formats code blocks
 * Supports both inline code (`code`) and block code (```code```)
 */

export interface FormattedSegment {
  type: 'text' | 'inline-code' | 'block-code';
  content: string;
  language?: string;
}

/**
 * Parses text content and identifies code segments
 */
export function parseTextWithCode(text: string): FormattedSegment[] {
  const segments: FormattedSegment[] = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    // Check for block code first (```)
    const blockCodeMatch = remaining.match(/\s*```(\w+)?\n([\s\S]*?)\n```/);
    if (blockCodeMatch) {
      const language = blockCodeMatch[1] || 'text';
      const code = blockCodeMatch[2];
      
      // Add any text before the code block
      const beforeText = remaining.substring(0, blockCodeMatch.index);
      if (beforeText.trim()) {
        segments.push({
          type: 'text',
          content: beforeText
        });
      }
      
      // Add the code block
      segments.push({
        type: 'block-code',
        content: code,
        language
      });
      
      remaining = remaining.substring(blockCodeMatch.index! + blockCodeMatch[0].length);
      continue;
    }
    
    // Check for inline code (`)
    const inlineCodeMatch = remaining.match(/`([^`\n]+)`/);
    if (inlineCodeMatch) {
      const code = inlineCodeMatch[1];
      
      // Add any text before the inline code
      const beforeText = remaining.substring(0, inlineCodeMatch.index);
      if (beforeText.trim()) {
        segments.push({
          type: 'text',
          content: beforeText
        });
      }
      
      // Add the inline code
      segments.push({
        type: 'inline-code',
        content: code
      });
      
      remaining = remaining.substring(inlineCodeMatch.index! + inlineCodeMatch[0].length);
      continue;
    }
    
    // No more code found, add remaining text
    segments.push({
      type: 'text',
      content: remaining
    });
    break;
  }
  
  return segments;
}

/**
 * Formats text content with proper code block detection and styling
 */
export function formatTextWithCode(text: string): FormattedSegment[] {
  // First normalize the text
  const normalizedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  
  return parseTextWithCode(normalizedText);
}

/**
 * Renders formatted segments as JSX elements
 */
export function renderFormattedSegments(segments: FormattedSegment[]): React.ReactNode[] {
  return segments.map((segment, index) => {
    switch (segment.type) {
      case 'inline-code':
        return (
          <code
            key={index}
            className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono border"
            style={{
              backgroundColor: 'var(--accent-muted)',
              borderColor: 'var(--accent)',
              color: 'var(--accent)',
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
            }}
          >
            {segment.content}
          </code>
        );
      
      case 'block-code':
        return (
          <div
            key={index}
            className="my-4 rounded-lg border overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-soft)',
              borderColor: 'var(--border)'
            }}
          >
            {segment.language && segment.language !== 'text' && (
              <div
                className="px-3 py-2 text-xs font-medium border-b"
                style={{
                  backgroundColor: 'var(--accent-muted)',
                  borderColor: 'var(--border)',
                  color: 'var(--accent)'
                }}
              >
                {segment.language}
              </div>
            )}
            <pre
              className="p-3 overflow-x-auto text-sm leading-relaxed"
              style={{
                backgroundColor: 'var(--bg-soft)',
                color: 'var(--fg)',
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
              }}
            >
              <code>{segment.content}</code>
            </pre>
          </div>
        );
      
      case 'text':
      default:
        return (
          <span key={index} className="whitespace-pre-wrap">
            {segment.content}
          </span>
        );
    }
  });
}
