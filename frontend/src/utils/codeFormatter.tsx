import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

/**
 * Enhanced text formatting utility with full markdown support
 * Supports headers, bold, italic, lists, links, code blocks, blockquotes, tables, etc.
 */

export interface FormattedSegment {
  type: 'text' | 'inline-code' | 'block-code';
  content: string;
  language?: string;
}

/**
 * Custom markdown components with theme-aware styling
 */
const markdownComponents: Partial<Components> = {
  // Headers
  h1: ({ children, ...props }) => (
    <h1 
      className="text-2xl font-bold mb-3 mt-4 pb-2 border-b"
      style={{ 
        color: 'var(--fg)',
        borderColor: 'var(--border)'
      }}
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 
      className="text-xl font-bold mb-2 mt-3"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 
      className="text-lg font-semibold mb-2 mt-3"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 
      className="text-base font-semibold mb-2 mt-2"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </h4>
  ),
  h5: ({ children, ...props }) => (
    <h5 
      className="text-sm font-semibold mb-1 mt-2"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </h5>
  ),
  h6: ({ children, ...props }) => (
    <h6 
      className="text-xs font-semibold mb-1 mt-2"
      style={{ color: 'var(--fg-muted)' }}
      {...props}
    >
      {children}
    </h6>
  ),
  
  // Paragraphs
  p: ({ children, ...props }) => (
    <p 
      className="mb-3 leading-relaxed"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </p>
  ),
  
  // Lists
  ul: ({ children, ...props }) => (
    <ul 
      className="list-disc list-inside mb-3 space-y-1 ml-2"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol 
      className="list-decimal list-inside mb-3 space-y-1 ml-2"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li 
      className="ml-4"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </li>
  ),
  
  // Inline code
  code: ({ inline, children, className, ...props }: any) => {
    // Extract language from className (format: language-xxx)
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    
    if (inline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded text-sm font-mono border mx-0.5"
          style={{
            backgroundColor: 'var(--accent-muted)',
            borderColor: 'var(--accent)',
            color: 'var(--accent)',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
          }}
          {...props}
        >
          {children}
        </code>
      );
    }
    
    // Block code - will be wrapped in <pre> by ReactMarkdown
    return (
      <code
        className={className}
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
        }}
        {...props}
      >
        {children}
      </code>
    );
  },
  
  // Pre/code blocks
  pre: ({ children, ...props }) => (
    <div
      className="my-4 rounded-lg border overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-soft)',
        borderColor: 'var(--border)'
      }}
    >
      <pre
        className="p-4 overflow-x-auto text-sm leading-relaxed m-0"
        style={{
          backgroundColor: 'var(--bg-soft)',
          color: 'var(--fg)'
        }}
        {...props}
      >
        {children}
      </pre>
    </div>
  ),
  
  // Blockquotes
  blockquote: ({ children, ...props }) => (
    <blockquote 
      className="border-l-4 pl-4 py-2 my-3 italic"
      style={{ 
        borderColor: 'var(--accent)',
        backgroundColor: 'var(--bg-soft)',
        color: 'var(--fg-muted)'
      }}
      {...props}
    >
      {children}
    </blockquote>
  ),
  
  // Links
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="underline hover:no-underline transition-colors"
      style={{ color: 'var(--accent)' }}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  
  // Strong/Bold
  strong: ({ children, ...props }) => (
    <strong 
      className="font-bold"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </strong>
  ),
  
  // Emphasis/Italic
  em: ({ children, ...props }) => (
    <em 
      className="italic"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </em>
  ),
  
  // Horizontal rule
  hr: (props) => (
    <hr 
      className="my-4 border-t"
      style={{ borderColor: 'var(--border)' }}
      {...props}
    />
  ),
  
  // Tables
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-4">
      <table 
        className="min-w-full border"
        style={{ 
          borderColor: 'var(--border)',
          color: 'var(--fg)'
        }}
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead 
      className="border-b"
      style={{ 
        backgroundColor: 'var(--bg-soft)',
        borderColor: 'var(--border)'
      }}
      {...props}
    >
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }) => (
    <tr 
      className="border-b"
      style={{ borderColor: 'var(--border)' }}
      {...props}
    >
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th 
      className="px-4 py-2 text-left font-semibold"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td 
      className="px-4 py-2"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </td>
  ),
};

/**
 * Parses text content and identifies code segments (legacy support)
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
 * Formats text content with proper markdown detection
 */
export function formatTextWithCode(text: string): FormattedSegment[] {
  // First normalize the text
  const normalizedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  
  return parseTextWithCode(normalizedText);
}

/**
 * Renders formatted segments as JSX elements using react-markdown
 * This is the new recommended way to render text content
 */
export function renderFormattedSegments(segments: FormattedSegment[]): React.ReactNode {
  // Reconstruct the markdown text from segments
  const markdownText = segments.map(segment => {
    switch (segment.type) {
      case 'inline-code':
        return `\`${segment.content}\``;
      case 'block-code':
        return `\n\`\`\`${segment.language || ''}\n${segment.content}\n\`\`\`\n`;
      case 'text':
      default:
        return segment.content;
    }
  }).join('');

  return (
    <div className="markdown-content">
      <ReactMarkdown components={markdownComponents}>
        {markdownText}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Direct markdown rendering - simpler API for new code
 */
export function renderMarkdown(text: string): React.ReactNode {
  // Normalize the text
  const normalizedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  return (
    <div className="markdown-content">
      <ReactMarkdown components={markdownComponents}>
        {normalizedText}
      </ReactMarkdown>
    </div>
  );
}
