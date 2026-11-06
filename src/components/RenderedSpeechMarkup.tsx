import React from 'react';
import { parseSpeechMarkup } from '@/utils/parseSpeechMarkup';

interface RenderedSpeechMarkupProps {
  text: string;
  className?: string;
}

// Renders the AI coach's marked-up rewritten speech: a visible pause mark,
// bold emphasis, italic slow-down phrasing, and highlighted vocab/pronunciation words.
const RenderedSpeechMarkup: React.FC<RenderedSpeechMarkupProps> = ({ text, className }) => {
  const segments = parseSpeechMarkup(text);

  return (
    <p className={className}>
      {segments.map((segment, index) => {
        switch (segment.type) {
          case 'pause':
            return (
              <span key={index} className="mx-1 text-secondary font-bold select-none" title="Pause here">
                |
              </span>
            );
          case 'bold':
            return (
              <strong key={index} className="font-bold text-gray-900">
                {segment.content}
              </strong>
            );
          case 'italic':
            return (
              <em key={index} className="italic text-gray-600" title="Slow down here">
                {segment.content}
              </em>
            );
          case 'highlight':
            return (
              <mark key={index} className="bg-red-100 text-red-700 px-1 rounded font-medium" title="New vocabulary / corrected pronunciation">
                {segment.content}
              </mark>
            );
          case 'text':
          default:
            return <React.Fragment key={index}>{segment.content}</React.Fragment>;
        }
      })}
    </p>
  );
};

export default RenderedSpeechMarkup;
