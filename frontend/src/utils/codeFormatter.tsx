import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  // Headers - compact spacing
  h1: ({ children, ...props }) => (
    <h1 
      className="text-lg font-bold mb-1.5 mt-2 pb-1 border-b"
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
      className="text-base font-bold mb-1 mt-1.5"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 
      className="text-sm font-semibold mb-0.5 mt-1.5"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 
      className="text-xs font-semibold mb-0.5 mt-1"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </h4>
  ),
  h5: ({ children, ...props }) => (
    <h5 
      className="text-xs font-semibold mb-0.5 mt-1"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </h5>
  ),
  h6: ({ children, ...props }) => (
    <h6 
      className="text-[10px] font-semibold mb-0.5 mt-1"
      style={{ color: 'var(--fg-muted)' }}
      {...props}
    >
      {children}
    </h6>
  ),
  
  // Paragraphs - compact spacing
  p: ({ children, ...props }) => (
    <p 
      className="mb-1 leading-tight"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </p>
  ),
  
  // Lists - compact spacing
  ul: ({ children, ...props }) => (
    <ul 
      className="list-disc list-inside mb-1 space-y-0.5 ml-2"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol 
      className="list-decimal list-inside mb-1 space-y-0.5 ml-2"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li 
      className="ml-3"
      style={{ color: 'var(--fg)' }}
      {...props}
    >
      {children}
    </li>
  ),
  
  // Inline code - compact sizing
  code: ({ inline, children, className, ...props }: any) => {
    // Extract language from className (format: language-xxx)
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    
    if (inline) {
      return (
        <code
          className="px-1 py-0.5 rounded text-[10px] font-mono border mx-0.5"
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
  
  // Pre/code blocks - compact spacing
  pre: ({ children, ...props }) => (
    <div
      className="my-1.5 rounded border overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-soft)',
        borderColor: 'var(--border)'
      }}
    >
      <pre
        className="p-2 overflow-x-auto text-[10px] leading-tight m-0"
        style={{
          backgroundColor: 'var(--bg-soft)',
          color: 'var(--fg)',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
        }}
        {...props}
      >
        {children}
      </pre>
    </div>
  ),
  
  // Blockquotes - compact spacing
  blockquote: ({ children, ...props }) => (
    <blockquote 
      className="border-l-2 pl-2 py-1 my-1.5 italic text-xs"
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
  
  // Images - for charts and visualizations
  img: ({ src, alt, ...props }: any) => (
    <div className="my-2">
      <img
        src={src}
        alt={alt || 'Chart'}
        className="max-w-full h-auto rounded border"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-soft)'
        }}
        onError={(e) => {
          console.warn('Failed to load image:', src);
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
        }}
        {...props}
      />
    </div>
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
  
  // Horizontal rule - compact spacing
  hr: (props) => (
    <hr 
      className="my-1.5 border-t"
      style={{ borderColor: 'var(--border)' }}
      {...props}
    />
  ),
  
  // Tables - compact spacing with improved styling
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-1.5 rounded border" style={{ borderColor: 'var(--border)' }}>
      <table 
        className="min-w-full text-xs border-collapse"
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
      className="border-b last:border-b-0 hover:bg-opacity-50 transition-colors"
      style={{ 
        borderColor: 'var(--border)',
        backgroundColor: 'transparent'
      }}
      {...props}
    >
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th 
      className="px-2 py-1 text-left font-semibold text-xs border-r last:border-r-0"
      style={{ 
        color: 'var(--fg)',
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg-soft)'
      }}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td 
      className="px-2 py-1 text-xs border-r last:border-r-0"
      style={{ 
        color: 'var(--fg)',
        borderColor: 'var(--border)'
      }}
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
      <ReactMarkdown 
        components={markdownComponents}
        remarkPlugins={[remarkGfm]}
      >
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
      <ReactMarkdown 
        components={markdownComponents}
        remarkPlugins={[remarkGfm]}
      >
        {normalizedText}
      </ReactMarkdown>
    </div>
  );
}
