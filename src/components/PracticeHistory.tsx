import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, AudioLines, Calendar, TrendingUp, ArrowRight, ChevronDown, Loader2, MicOff } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';
import { useAuth } from '@/context/AuthContext';
import { getUserSpeechAnalyses } from '@/utils/speechDataService';
import { toast } from 'sonner';
import { scoreBadge } from '@/lib/utils';

const formatDuration = (totalSeconds: number): string => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatDate = (date: string | Date) =>
  new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// Prefer the model's own holistic judgment; fall back to a plain average only
// for sessions saved before overallScore existed.
const scoreOf = (overallScore: unknown, feedback: { score: number }[] | undefined) =>
  typeof overallScore === 'number'
    ? overallScore
    : feedback?.length
      ? Math.round(feedback.reduce((sum, f) => sum + f.score, 0) / feedback.length)
      : 0;

const MODE_LABELS: Record<string, string> = { 'job-interview': 'Job interview', speech: 'Public speaking', presentation: 'Presentation', 'reading-exercise': 'Reading' };
const MAX_TITLE_WORDS = 8;
const TRAILING_FILLER = /^(a|an|the|and|but|or|of|to|for|in|on|at|with|your|you|it|is|are|can|that|this|need|needs|filled|full)$/i;
// Practice prompts are paragraphs - name the row by their opening clause: "You've invented a
// time machine, but it can only..." -> "You've invented a time machine". The full prompt is the tooltip.
const shortName = (text?: string) => {
  if (!text?.trim()) return '';
  const sentence = text.trim().split(/(?<=[.?!])\s/)[0];
  const clause = sentence.split(/[,;]/)[0].trim().split(/\s+/).length >= 3 ? sentence.split(/[,;]/)[0] : sentence;
  const words = clause.trim().split(/\s+/);
  const kept = words.slice(0, MAX_TITLE_WORDS);
  while (kept.length > 2 && TRAILING_FILLER.test(kept[kept.length - 1].replace(/[^\w']/g, ''))) kept.pop();
  // A whole sentence that fits stays as it is ("Should schools require students to wear uniforms?").
  if (kept.length === words.length && clause === sentence) return sentence;
  return `${kept.join(' ').replace(/[,:;.?!]$/, '')}…`;
};
// The practice modes all save purposeKey 'speech'; their purpose names the mode. Reports saved
// before purpose was stored fall back to the purposeKey label.
const PRACTICE_MODES: Record<string, string> = { storytelling: 'Storytelling', 'creative storytelling': 'Creative storytelling', 'descriptive narration': 'Descriptive narration', 'debate argument': 'Debate' };
const sessionName = (config?: { purposeKey?: string; purpose?: string; practicePrompt?: string; topic?: string } | null) => {
  const full = config?.practicePrompt || config?.topic || '';
  return { title: shortName(full), fullTitle: full, mode: PRACTICE_MODES[config?.purpose ?? ''] ?? MODE_LABELS[config?.purposeKey ?? ''] };
};

interface Session {
  id: string;
  title: string;
  fullTitle?: string;
  mode?: string;
  date: string;
  duration: string;
  score: number;
  unsaved?: boolean;
  noSpeech?: boolean;
}

interface PracticeHistoryProps {
  onViewReport: () => void;
}

const PracticeHistory: React.FC<PracticeHistoryProps> = ({ onViewReport }) => {
  const { speechData, hasRecorded, speechConfig, savedAnalysisId, isViewingHistorical, loadHistoricalSession } = useSpeech();
  const { user } = useAuth();
  const [historicalSessions, setHistoricalSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setLoadFailed(false);
    getUserSpeechAnalyses()
      .then(setHistoricalSessions)
      .catch(error => {
        console.error('Error fetching practice history:', error);
        setLoadFailed(true);
        toast.error("Couldn't load your past analyses. Please refresh to try again.");
      })
      .finally(() => setLoading(false));
    // Refetch once a new analysis is saved, so it appears at the top.
  }, [user, savedAnalysisId]);

  // Named by the question/topic it answered; older rows saved without one fall back to a
  // number (newest first, so the oldest is #1). The saved title only repeated the date.
  const saved: Session[] = historicalSessions.map((session, i) => ({
    id: session.id,
    ...sessionName(session.analytics?.speechConfig),
    title: shortName(session.analytics?.speechConfig?.practicePrompt || session.analytics?.speechConfig?.topic) || `Analysis #${historicalSessions.length - i}`,
    date: formatDate(session.created_at),
    duration: session.analytics?.speechMetrics?.speechDuration
      ? formatDuration(session.analytics.speechMetrics.speechDuration)
      : '--:--',
    score: scoreOf(session.analytics?.overallScore, session.feedback),
    noSpeech: session.analytics?.speechMetrics?.wordsPerMinute === 0,
  }));

  // An analysis that isn't in the database - a trial (signed-out) user's, or
  // one whose save failed - is still viewable for as long as it's in memory.
  const unsavedCurrent: Session | null = speechData && hasRecorded && !savedAnalysisId && !isViewingHistorical
    ? {
        id: 'current',
        ...sessionName(speechConfig),
        title: shortName(speechConfig?.practicePrompt || speechConfig?.topic) || speechConfig?.purpose || 'Latest speech',
        date: formatDate(speechData.recordingDate),
        duration: speechData.speechMetrics ? formatDuration(speechData.speechMetrics.speechDuration) : '--:--',
        score: scoreOf(speechData.overallScore, speechData.feedback),
        noSpeech: speechData.speechMetrics?.wordsPerMinute === 0,
        unsaved: true,
      }
    : null;

  const sessions = unsavedCurrent ? [unsavedCurrent, ...saved] : saved;
  const visible = showAll ? sessions : sessions.slice(0, 5);
  const scored = sessions.filter(s => !s.noSpeech);
  const trend = scored.length >= 2 ? scored[0].score - scored[1].score : null;

  const viewReport = async (session: Session) => {
    // Already in memory: the unsaved one, or the saved one currently loaded.
    if (session.unsaved || session.id === savedAnalysisId) {
      onViewReport();
      return;
    }
    setOpeningId(session.id);
    try {
      await loadHistoricalSession(session.id);
      onViewReport();
    } catch (error) {
      console.error('Error loading report:', error);
      toast.error('Could not open this report. Please try again.');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <Card className="shadow-lg shadow-slate-900/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg font-semibold text-slate-900">
          <span className="flex items-center gap-2">
            <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><Clock className="h-5 w-5" /></span>
            Your analyses
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </span>
          {scored.length > 0 && (
            <span className="flex items-center gap-2 text-sm font-normal text-gray-600">
              <span className="rounded-full border bg-accent/30 px-3 py-1">Avg <strong className="tabular-nums text-gray-900">{Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length)}</strong></span>
              <span className="rounded-full border bg-accent/30 px-3 py-1">Best <strong className="tabular-nums text-gray-900">{Math.max(...scored.map(s => s.score))}</strong></span>
              {trend !== null && (
                <span className={`flex items-center gap-1 rounded-full px-3 py-1 tabular-nums ${trend >= 0 ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                  <TrendingUp className={`h-3 w-3 ${trend >= 0 ? '' : 'rotate-180'}`} />
                  {trend > 0 ? '+' : ''}{trend}
                </span>
              )}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 && !loading ? (
          <div className="py-8 text-center text-gray-500">
            <AudioLines className="mx-auto mb-2 h-12 w-12 opacity-30" />
            {loadFailed ? (
              <>
                <p>Couldn't load your past analyses</p>
                <p className="text-sm">Please refresh the page to try again.</p>
              </>
            ) : (
              <>
                <p>No analyses yet</p>
                <p className="text-sm">Record or upload a speech above - its report will appear here.</p>
              </>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map(session => (
              <li key={session.id} className="relative flex cursor-pointer items-center gap-4 rounded-xl border bg-accent/30 p-3 transition-colors hover:border-secondary/30 hover:bg-accent/60 sm:p-4">
                {session.noSpeech ? (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700" title="Not enough speech to score">
                    <MicOff className="h-5 w-5" />
                  </div>
                ) : (
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-display text-lg font-semibold tabular-nums ${scoreBadge(session.score)}`}>
                    {session.score}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-slate-900" title={session.fullTitle || undefined}>{session.title}</p>
                    {session.unsaved && <Badge variant="outline" className="shrink-0 text-xs">Not saved</Badge>}
                    {session.noSpeech && <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 text-xs text-amber-700">No speech detected</Badge>}
                  </div>
                  <p className="mt-0.5 flex items-center gap-3 text-sm text-gray-500">
                    {session.mode && <span className="font-medium text-gray-600">{session.mode}</span>}
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{session.date}</span>
                    <span className="flex items-center gap-1"><AudioLines className="h-3 w-3" />{session.duration}</span>
                  </p>
                </div>
                {/* The button's ::after covers the whole row, so clicking anywhere opens the report. */}
                <Button size="sm" variant="ghost" className="text-secondary after:absolute after:inset-0 after:rounded-xl hover:bg-secondary/10 hover:text-secondary" onClick={() => viewReport(session)} disabled={openingId !== null} aria-label="View report">
                  <span className="hidden sm:inline">View report</span>
                  {openingId === session.id ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {sessions.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-3 flex w-full items-center justify-center gap-1 py-2 text-sm font-medium text-secondary hover:text-secondary/80"
          >
            {showAll ? 'Show less' : `View all ${sessions.length} analyses`}
            <ChevronDown className={`h-4 w-4 transition-transform ${showAll ? 'rotate-180' : ''}`} />
          </button>
        )}

        {!user && (
          <p className="mt-3 text-center text-sm text-gray-500">
            Sign up to keep your reports and track progress over time.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default PracticeHistory;
