import { toast } from 'sonner';
import type { SpeechData } from '@/context/SpeechContext';
import { isFillerOnly, spokenWords, isHesitation, pauseInstead, classifyGrammarFix, consistentAlignmentStatus, courtesyContentIssue, grammarVerdict, isCourtesy, isWrittenOnlyIssue, NOT_SPOKEN_GRAMMAR, NOT_GRAMMAR_TIP } from '../../supabase/functions/analyze-speech-openai/spoken.ts';

// Reports saved before a rule in spoken.ts existed still hold the mistakes it now drops
// (misheard "spelling" errors, "I I" counted as grammar, punctuation tips) - apply the
// same rules when one is opened, and re-score Grammar if its error count changed.
export const applySpokenRules = (data: SpeechData): SpeechData => {
  const grammar = data.grammarAnalysis;
  const vocab = data.vocabularyAnalysis;
  const content = data.contentQualityAnalysis;
  const alignment = content?.contextAlignment && {
    ...content.contextAlignment,
    status: consistentAlignmentStatus(content.contextAlignment.status, content.contextAlignment.summary || '', content.contextAlignment.missingPoints?.length ?? 0) as NonNullable<typeof content.contextAlignment>['status'],
  };
  const issues = (grammar?.issues || [])
    .filter(i => typeof i?.original === 'string' && typeof i?.corrected === 'string' &&
      !NOT_SPOKEN_GRAMMAR.test(i.errorType || '') && !isWrittenOnlyIssue(i.errorType, i.explanation) &&
      !isCourtesy(i.original) && classifyGrammarFix(i.original, i.corrected) !== 'drop')
    .map(i => ({ ...i, kind: i.kind === 'refinement' || classifyGrammarFix(i.original, i.corrected) === 'optional' ? 'refinement' as const : 'error' as const }));
  const errorsBefore = (grammar?.issues || []).filter(i => i?.kind !== 'refinement').length;
  const regrade = grammar && !grammar.unavailable && issues.filter(i => i.kind === 'error').length !== errorsBefore;
  const verdict = regrade ? grammarVerdict(issues, data.transcription || '') : null;
  return {
    ...data,
    grammarAnalysis: grammar && {
      ...grammar,
      issues,
      tips: issues.some(i => i.kind === 'error') ? (grammar.tips || []).filter(t => !NOT_GRAMMAR_TIP.test(t)) : [],
    },
    vocabularyAnalysis: vocab && {
      ...vocab,
      weaknesses: (vocab.weaknesses || []).filter(w => !isCourtesy(w.word || '') && !isFillerOnly(spokenWords(w.word || '').split(' ')) && !isWrittenOnlyIssue(undefined, w.suggestion)),
    },
    contentQualityAnalysis: content && {
      ...content,
      contextAlignment: alignment && {
        ...alignment,
        missingPoints: alignment.status === 'aligned' ? [] : alignment.missingPoints || [],
      },
      issues: (content.issues || [])
        .filter(i => courtesyContentIssue(i.type || '', i.excerpt || '') !== 'drop')
        .map(i => (courtesyContentIssue(i.type || '', i.excerpt || '') === 'unquote' ? { ...i, excerpt: '' } : i))
        // "Off topic" items only under an "Off topic" badge, as the server now does.
        .map(i => (i.type === 'off-topic' && alignment && alignment.status !== 'off-topic' ? { ...i, type: 'missing-detail' } : i)),
    },
    mistakes: (data.mistakes || []).map(m =>
      m?.type === 'filler' && typeof m.text === 'string' && isHesitation(m.text) ? { ...m, alternatives: [], suggestion: pauseInstead(m.text) } : m),
    feedback: verdict
      ? data.feedback.map(f => /grammar/i.test(f?.category || '')
        ? { ...f, score: verdict.score, feedback: verdict.text, color: verdict.score >= 80 ? 'green' : verdict.score >= 60 ? 'yellow' : 'red' }
        : f)
      : data.feedback,
  };
};

// Shows why an analysis failed. The server's own messages (daily limit, file too
// large, rate limit, ...) are written for users, so show them as-is; only
// internal/technical failures fall back to a generic message.
export const toastAnalysisError = (error: unknown) => {
  const message = (error instanceof Error ? error.message : '').replace(/^Speech analysis failed:\s*/, '').trim();

  if (/Invalid file format|Transcription failed/i.test(message)) {
    toast.error('This audio file could not be transcribed.', {
      description: 'Try re-exporting it as MP3 or WAV, or record directly in the browser instead.'
    });
  } else if (!message || /API key|Analysis failed|Edge Function|No data received/i.test(message)) {
    toast.error('Failed to analyze speech. Please try again.');
  } else {
    toast.error(message);
  }
};

// Browsers are inconsistent about the MIME type they report for picked files -
// m4a in particular often comes back as "audio/x-m4a" or even "" depending on
// OS/browser, neither of which the backend recognizes, which made it mislabel
// the file's extension and get an "Invalid file format" rejection from Whisper.
// The filename extension (validated by callers) is unambiguous, so prefer it.
const CANONICAL_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  m4a: 'audio/x-m4a',
};

export const fileToAudioBlob = async (file: File): Promise<Blob> => {
  const ext = file.name.match(/\.(mp3|wav|webm|ogg|m4a)$/i)?.[1].toLowerCase();
  return new Blob([await file.arrayBuffer()], { type: (ext && CANONICAL_MIME[ext]) || file.type });
};
