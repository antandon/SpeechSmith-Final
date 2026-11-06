import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MicOff } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import NoSpeechNotice, { isNoSpeech } from '@/components/NoSpeechNotice';
import SpeechFeedback from '@/components/SpeechFeedback';
import SpeechAnalytics from '@/components/SpeechAnalytics';
import FeedbackRating from '@/components/FeedbackRating';
import SpeechTranscript from '@/components/SpeechTranscript';
import PronunciationAssessment from '@/components/PronunciationAssessment';
import GrammarAnalysis from '@/components/GrammarAnalysis';
import VocabularyAnalysis from '@/components/VocabularyAnalysis';
import ContentQualityAnalysis from '@/components/ContentQualityAnalysis';
import FillerWordCloud from '@/components/FillerWordCloud';
import MoodToneAnalysis from '@/components/MoodToneAnalysis';
import EmphasisSuggestions from '@/components/EmphasisSuggestions';
import { scoreBadge } from '@/lib/utils';


interface AnalysisReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// The full verdict for whichever analysis is in SpeechContext (just recorded,
// or loaded from history), split into tabs so it reads one area at a time
// instead of a dozen stacked sections.
const AnalysisReport: React.FC<AnalysisReportProps> = ({ open, onOpenChange }) => {
  const { speechData } = useSpeech();
  const [tab, setTab] = useState('overview');
  const bodyRef = useRef<HTMLDivElement>(null);

  // Every report starts on Overview, at the top.
  useEffect(() => {
    if (open) setTab('overview');
  }, [open, speechData?.recordingDate]);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [tab, speechData?.recordingDate]);

  if (!speechData) return null;

  const noSpeech = isNoSpeech(speechData);
  // Same fallback as the report's cards: older reports without overallScore average the numeric feedback scores.
  const scores = (speechData.feedback || []).map(f => f?.score).filter((n): n is number => typeof n === 'number');
  const score = typeof speechData.overallScore === 'number'
    ? speechData.overallScore
    : scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : undefined;
  const date = new Date(speechData.recordingDate).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[92vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0"
        // Radix would focus the first tab panel, drawing a focus ring around the report.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="border-b bg-background px-4 pt-5 sm:px-6">
            <div className="flex items-start gap-4 pr-8">
              {noSpeech ? (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <MicOff className="h-6 w-6" />
                </div>
              ) : typeof score === 'number' && (
                <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full font-bold ${scoreBadge(score)}`}>
                  <span className="text-lg leading-none">{score}</span>
                  <span className="text-[10px] font-medium opacity-70">/100</span>
                </div>
              )}
              <div className="min-w-0">
                <DialogTitle className="text-xl">Speech report</DialogTitle>
                <DialogDescription className="mt-1">{date}</DialogDescription>
              </div>
            </div>
            {noSpeech ? <div className="h-5" /> : <TabsList className="mt-4 mb-3 grid w-full grid-cols-2 sm:w-auto sm:inline-grid sm:grid-cols-4 h-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              <TabsTrigger value="linguistic">Linguistic</TabsTrigger>
              <TabsTrigger value="paralinguistic">Paralinguistic</TabsTrigger>
            </TabsList>}
          </div>

          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 py-6 sm:px-6">
            {noSpeech ? (
              <NoSpeechNotice speechData={speechData} onRetry={() => onOpenChange(false)} />
            ) : (<>
            <TabsContent value="overview" className="mt-0 space-y-6">
              <SpeechAnalytics />
              <SpeechFeedback />
              <div className="mx-auto max-w-2xl">
                <FeedbackRating />
              </div>
            </TabsContent>

            <TabsContent value="transcript" className="mt-0">
              <ErrorBoundary><SpeechTranscript /></ErrorBoundary>
            </TabsContent>

            <TabsContent value="linguistic" className="mt-0 space-y-6">
              <PronunciationAssessment />
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <ErrorBoundary><GrammarAnalysis /></ErrorBoundary>
                <ErrorBoundary><VocabularyAnalysis /></ErrorBoundary>
              </div>
              <ErrorBoundary><ContentQualityAnalysis /></ErrorBoundary>
              <FillerWordCloud />
            </TabsContent>

            <TabsContent value="paralinguistic" className="mt-0">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <MoodToneAnalysis />
                <ErrorBoundary><EmphasisSuggestions /></ErrorBoundary>
              </div>
            </TabsContent>
            </>)}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AnalysisReport;
