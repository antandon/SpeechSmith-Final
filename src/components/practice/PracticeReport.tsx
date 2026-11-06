import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Calendar, Loader2, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useSpeech } from '@/context/SpeechContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { isNoSpeech } from '../NoSpeechNotice';
import AnalysisReport from '../AnalysisReport';
import { scoreBadge } from '@/lib/utils';

type Attempt = { id: string; created_at: string; score: number | null; wpm: number | null };
// Typed as plain string: the client's select-string parser chokes on these JSON paths.
const ATTEMPT_COLUMNS: string = 'id, created_at, score:analytics->overallScore, wpm:analytics->speechMetrics->wordsPerMinute';

const ScoreDot: React.FC<{ score?: number | null; noSpeech: boolean }> = ({ score, noSpeech }) =>
  noSpeech ? (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
      <MicOff className="h-5 w-5" />
    </div>
  ) : typeof score === 'number' ? (
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-display text-lg font-semibold tabular-nums ${scoreBadge(score)}`}>{score}</div>
  ) : null;

// Practice modes show the same tabbed report as the dashboard. Under the
// question: the answer just recorded plus the user's saved answers to this exact
// prompt, so a verdict doesn't vanish when they move between questions or come back.
const PracticeReport: React.FC<{ prompt?: string }> = ({ prompt }) => {
  const { speechData, savedAnalysisId, loadHistoricalSession } = useSpeech();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);

  // A result for another prompt (left over from the dashboard or another question) isn't this one's.
  const current = speechData && speechData.speechConfig?.practicePrompt === prompt ? speechData : null;

  // Open the report when a new result lands - not for one already there on arrival.
  const seen = useRef(current?.recordingDate);
  useEffect(() => {
    if (current && current.recordingDate !== seen.current) setOpen(true);
    seen.current = current?.recordingDate;
  }, [current?.recordingDate]);

  useEffect(() => {
    if (!user || !prompt) return setAttempts([]);
    let live = true;
    supabase.from('speech_analyses')
      .select(ATTEMPT_COLUMNS)
      .eq('analytics->speechConfig->>practicePrompt', prompt)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Error fetching past answers:', error);
        if (live) setAttempts((data as unknown as Attempt[]) || []);
      });
    return () => { live = false; };
    // Refetch once a new answer is saved, so it joins the list.
  }, [user, prompt, savedAnalysisId]);

  const viewAttempt = async (id: string) => {
    if (id !== savedAnalysisId) {
      setOpeningId(id);
      try {
        await loadHistoricalSession(id);
      } catch {
        toast.error('Could not open this report. Please try again.');
        return;
      } finally {
        setOpeningId(null);
      }
    }
    setOpen(true);
  };

  // The saved copy of the current answer is already in the list.
  const showCurrent = current && !attempts.some(a => a.id === savedAnalysisId);
  if (!showCurrent && attempts.length === 0) return null;

  return (
    <div className="space-y-3">
      {showCurrent && (
        <div className="relative flex cursor-pointer items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition-colors hover:border-secondary/30 hover:bg-accent/30">
          <ScoreDot score={current.overallScore} noSpeech={isNoSpeech(current)} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{isNoSpeech(current) ? 'Too short or unclear to score' : 'Your report is ready'}</p>
            <p className="text-sm text-slate-500">Overview, transcript, linguistic and paralinguistic feedback.</p>
          </div>
          <Button className="after:absolute after:inset-0 after:rounded-xl" onClick={() => setOpen(true)}>View report</Button>
        </div>
      )}

      {attempts.length > 0 && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h4 className="mb-3 font-semibold text-slate-900">Your answers to this question <span className="font-normal text-slate-500">({attempts.length})</span></h4>
          {/* Scrolls past ~4 answers so a long history doesn't stretch the page. */}
          <ul className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
            {attempts.map((a, i) => (
              <li key={a.id} className="relative flex cursor-pointer items-center gap-4 rounded-xl border bg-accent/30 p-3 transition-colors hover:border-secondary/30 hover:bg-accent/60 sm:p-4">
                <ScoreDot score={a.score} noSpeech={a.wpm === 0} />
                <div className="min-w-0 flex-1">
                  {/* Numbered oldest first, so "Answer 1" is the first try and stays that way as more come in. */}
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">Answer {attempts.length - i}</p>
                    {a.wpm === 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">No speech detected</span>}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
                    <Calendar className="h-3 w-3" />
                    {new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                {/* Same as the dashboard list: the button's ::after covers the whole row, so clicking anywhere opens the report. */}
                <Button size="sm" variant="ghost" className="text-secondary after:absolute after:inset-0 after:rounded-xl hover:bg-secondary/10 hover:text-secondary" onClick={() => viewAttempt(a.id)} disabled={openingId !== null} aria-label="View report">
                  <span className="hidden sm:inline">View report</span>
                  {openingId === a.id ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AnalysisReport open={open} onOpenChange={setOpen} />
    </div>
  );
};

export default PracticeReport;
