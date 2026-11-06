import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Volume, CheckCircle, AlertCircle, XCircle, BookOpen, Volume2, Loader2, ArrowRight, Play, Lightbulb } from 'lucide-react';
import { useSpeech, type MeasuredDelivery } from '@/context/SpeechContext';
import { useAuth } from '@/context/AuthContext';
import { getUserSpeechAnalyses } from '@/utils/speechDataService';
import { generateSpeechFromText } from '@/utils/openaiTTS';
import { toast } from 'sonner';
import { scoreText, scoreBadge } from '@/lib/utils';

// Available OpenAI TTS voices

const formatSeconds = (totalSeconds: number): string => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// "Your clarity dipped in the closing (68, vs 92 in the opening)".
const sectionVerdict = (sections: NonNullable<MeasuredDelivery['sections']>) => {
  const best = sections.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));
  const worst = sections.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
  if (best.accuracy - worst.accuracy < 10) return 'Your clarity held steady from start to finish.';
  return `Your clarity dipped in the ${worst.label.toLowerCase()} (${worst.accuracy}, vs ${best.accuracy} in the ${best.label.toLowerCase()})`
    + (worst.pauseIssues ? `, with ${worst.pauseIssues} awkward pause${worst.pauseIssues > 1 ? 's' : ''} there.` : '.');
};

const PronunciationAssessment: React.FC = () => {
  const { speechData, hasRecorded, savedAnalysisId } = useSpeech();
  const { user } = useAuth();
  const [playingWord, setPlayingWord] = useState<string | null>(null);
  const [audioCache, setAudioCache] = useState<{ [key: string]: string }>({});
  // The most recent earlier report with sound scores, to show progress per sound.
  const [previous, setPrevious] = useState<{ date: string; scores: Record<string, number> } | null>(null);
  const recordingDate = speechData?.recordingDate;

  useEffect(() => {
    setPrevious(null);
    if (!user || !recordingDate) return;
    let cancelled = false;
    getUserSpeechAnalyses()
      .then(rows => {
        const earlier = rows.find((r: any) => {
          const m = r.analytics?.pitchAnalysis?.measured;
          return r.id !== savedAnalysisId && new Date(r.created_at) < new Date(recordingDate)
            && m?.soundScores && Object.keys(m.soundScores).length > 0 && (m.accent ?? 'en-US') === 'en-US';
        });
        if (!cancelled && earlier) setPrevious({ date: earlier.created_at, scores: (earlier.analytics as any).pitchAnalysis.measured.soundScores });
      })
      .catch(error => console.error('Error loading sound progress:', error));
    return () => { cancelled = true; };
  }, [user, recordingDate, savedAnalysisId]);

  const playPronunciation = async (word: string) => {
    try {
      setPlayingWord(word);

      const cacheKey = word;

      // Check cache first
      if (audioCache[cacheKey]) {
        const audio = new Audio(audioCache[cacheKey]);
        audio.onended = () => setPlayingWord(null);
        await audio.play();
        return;
      }

      // Words are always voiced in American English.
      const result = await generateSpeechFromText(word, 'nova');
      
      if (result.success && result.audioUrl) {
        // Cache the audio URL
        setAudioCache(prev => ({ ...prev, [cacheKey]: result.audioUrl! }));
        
        const audio = new Audio(result.audioUrl);
        audio.onended = () => setPlayingWord(null);
        await audio.play();
      } else {
        toast.error(result.error || "Failed to generate pronunciation audio");
        setPlayingWord(null);
      }
    } catch (error) {
      console.error('Error playing pronunciation:', error);
      toast.error("Failed to play pronunciation");
      setPlayingWord(null);
    }
  };

  // The analysis' feedback item whose category mentions any of the keys (malformed items skipped).
  const isCategory = (f: { category?: unknown } | null | undefined, ...keys: string[]) =>
    typeof f?.category === 'string' && keys.some(k => (f.category as string).toLowerCase().includes(k));
  const scoreFor = (...keys: string[]) => {
    const score = speechData?.feedback?.find(f => isCategory(f, ...keys))?.score;
    return typeof score === 'number' ? score : 0;
  };

  const getPronunciationScore = () => scoreFor('clarity', 'pronunciation');
  const getPaceScore = () => scoreFor('pace', 'rate');
  const getEmotionalScore = () => scoreFor('emotional', 'delivery');

  // This card's headline is pronunciation, not the whole-speech overall score.
  const clarityScore = getPronunciationScore() || speechData?.pronunciationAccuracy || 0;

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (score >= 60) return <AlertCircle className="h-4 w-4 text-amber-600" />;
    return <XCircle className="h-4 w-4 text-red-600" />;
  };

  // Extract mispronounced words from the actual analysis
  const getMispronuncedWords = () => {
    if (!speechData?.mispronuncedWords || speechData.mispronuncedWords.length === 0) return [];
    // Ensure each word has a correctWord field
    return speechData.mispronuncedWords.map(word => ({
      ...word,
      correctWord: word.correctWord || word.word
    }));
  };

  if (!speechData || !hasRecorded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><Volume className="h-5 w-5" /></span>
            <span>Pronunciation Assessment</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-10 text-gray-500">
          <p>Record a speech to get detailed pronunciation assessment</p>
        </CardContent>
      </Card>
    );
  }

  // Extract actual data from analysis
  const mistakes = speechData.mistakes || [];
  // Fillers and pronunciation have their own sections; volume is no longer
  // reported (client request), but older saved sessions may still contain it.
  const otherIssues = mistakes.filter(m => m.type !== 'filler' && m.type !== 'pronunciation' && m.type !== 'volume');
  const mispronuncedWords = getMispronuncedWords();
  // Azure's audio measurements, when it ran.
  const tone = speechData.emotionAnalysis ?? speechData.pitchAnalysis;
  const measured = tone && 'measured' in tone ? tone.measured : undefined;
  const readingCheck = tone?.readingCheck;
  const pronunciationFeedback = (speechData.feedback || []).filter(f => isCategory(f, 'clarity', 'pronunciation') && f.feedback);
  const comparedSounds = previous && measured?.soundScores
    ? Object.entries(measured.soundScores)
        .filter(([sound]) => sound in previous.scores)
        .map(([sound, now]) => ({ sound, before: previous.scores[sound], now, change: now - previous.scores[sound] }))
    : [];
  const soundProgress = comparedSounds.length
    ? comparedSounds
        .filter(s => Math.abs(s.change) >= 5)
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
        .slice(0, 4)
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><Volume className="h-5 w-5" /></span>
          <span>Pronunciation Assessment</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Pronunciation Clarity</span>
              {getScoreIcon(clarityScore)}
            </div>
            <div className={`text-2xl font-bold ${scoreText(clarityScore)}`}>
              {clarityScore}/100
            </div>
            <Progress value={clarityScore} className="mt-2" />
          </div>

          <div className="bg-gray-50 p-4 rounded-md">
            <div className="text-sm font-medium mb-2">Issues Found</div>
            <div className={`text-2xl font-bold ${mispronuncedWords.length === 0 ? 'text-green-600' : 'text-red-600'}`}>
              {mispronuncedWords.length}
            </div>
            <p className="text-xs text-gray-600 mt-1">Mispronounced words</p>
          </div>
        </div>
        {!measured && clarityScore > 0 && (
          <p className="-mt-3 flex items-center gap-1 text-xs text-amber-700">
            <AlertCircle className="h-3 w-3" /> Estimated from your transcript - we couldn't measure your pronunciation from the audio this time. Try analysing again for a measured score.
          </p>
        )}

        {readingCheck && (
          <div className="rounded-md border p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold flex items-center gap-2"><BookOpen className="h-4 w-4" /> Reading Accuracy</h4>
              <Badge className={scoreBadge(readingCheck.accuracy)}>{readingCheck.accuracy}%</Badge>
            </div>
            <p className="text-sm text-gray-700 mb-3">
              {readingCheck.skipped.length + readingCheck.extra.length + readingCheck.misread.length === 0
                ? 'You read the passage word for word.'
                : `${readingCheck.accuracy}% of the passage was read exactly as written.`}
            </p>
            <div className="space-y-2 text-sm">
              {readingCheck.misread.length > 0 && (
                <p><span className="font-medium">Misread:</span> {readingCheck.misread.map(m => `"${m.expected}" read as "${m.said}"`).join(', ')}</p>
              )}
              {readingCheck.skipped.length > 0 && (
                <p><span className="font-medium">Skipped:</span> {readingCheck.skipped.map(w => `"${w}"`).join(', ')}</p>
              )}
              {readingCheck.extra.length > 0 && (
                <p><span className="font-medium">Added:</span> {readingCheck.extra.map(w => `"${w}"`).join(', ')}</p>
              )}
            </div>
          </div>
        )}

        {/* Category Scores */}
        <div>
          <h4 className="font-semibold mb-3">Category Analysis</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Pronunciation Clarity</span>
              <Badge className={scoreBadge(getPronunciationScore())}>
                {getPronunciationScore()}/100
              </Badge>
            </div>
            <Progress value={getPronunciationScore()} className="h-2" />
            
            <div className="flex items-center justify-between">
              <span className="font-medium">Speaking Pace</span>
              <Badge className={scoreBadge(getPaceScore())}>
                {getPaceScore()}/100
              </Badge>
            </div>
            <Progress value={getPaceScore()} className="h-2" />
            
            <div className="flex items-center justify-between">
              <span className="font-medium">Emotional Delivery</span>
              <Badge className={scoreBadge(getEmotionalScore())}>
                {getEmotionalScore()}/100
              </Badge>
            </div>
            <Progress value={getEmotionalScore()} className="h-2" />
          </div>
        </div>

        {/* Pace & pause data from the recording's word timestamps (estimates when measured === false; older reports lack the flag) */}
        {speechData?.speechMetrics && typeof speechData.speechMetrics.wordsPerMinute === 'number' && (
          <div className="border rounded-md p-4 bg-gray-50">
            <h4 className="font-semibold mb-3">
              Pace & Pausing ({speechData.speechMetrics.measured === false ? 'estimated' : 'measured from your recording'})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-xs text-muted-foreground uppercase">Overall Pace</div>
                <div className="text-xl font-bold">{speechData.speechMetrics.wordsPerMinute} WPM</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase">Duration</div>
                <div className="text-xl font-bold">{formatSeconds(speechData.speechMetrics.speechDuration)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase">Pauses Detected</div>
                <div className="text-xl font-bold">{speechData.speechMetrics.totalPauses}</div>
              </div>
            </div>

            {speechData.speechMetrics.sectionPace?.length > 0 && !speechData.speechMetrics.sectionPace.some(s => !s.wordsPerMinute) && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Pace by Section</div>
                <div className="flex flex-wrap gap-3">
                  {speechData.speechMetrics.sectionPace.map((section) => (
                    <Badge key={section.label} variant="outline" className="text-sm">
                      {section.label}: {section.wordsPerMinute} WPM
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {speechData.speechMetrics.pauseTimestamps?.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Pause Locations</div>
                <div className="flex flex-wrap gap-2">
                  {speechData.speechMetrics.pauseTimestamps.map((pause, idx) => (
                    <Badge key={idx} variant="secondary" className="text-sm">
                      {pause.timestamp} ({pause.durationSeconds}s)
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {measured && measured.pauses.length > 0 && (
              <div className="mt-4 text-sm space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Pause Placement</div>
                {measured.pauses.map((p, i) => (
                  <p key={i} className="text-gray-700">
                    • "{p.previous} {p.word}" - {p.kind === 'unexpected'
                      ? `you paused before "${p.word}" where the sentence should flow on`
                      : `a short pause before "${p.word}" would make this easier to follow`}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {measured?.sections && measured.sections.length > 1 && (
          <div className="rounded-md border p-4">
            <h4 className="font-semibold mb-1">Clarity by Section</h4>
            <p className="text-sm text-gray-700 mb-3">{sectionVerdict(measured.sections)}</p>
            <div className="flex flex-wrap gap-2">
              {measured.sections.map(section => (
                <Badge key={section.label} className={scoreBadge(section.accuracy)}>
                  {section.label}: {section.accuracy}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {measured?.weakSounds && measured.weakSounds.length > 0 && (
          <div className="rounded-md border p-4">
            <h4 className="font-semibold mb-1">Sounds to Practice</h4>
            <p className="text-xs text-muted-foreground mb-3">Individual sounds that came out unclear, measured from your audio</p>
            <div className="space-y-2">
              {measured.weakSounds.map(s => (
                <div key={s.sound} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-base">/{s.sound}/</Badge>
                  <span className="text-gray-700">in {s.words.map(w => `"${w}"`).join(', ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {comparedSounds.length > 0 && previous && (
          <div className="rounded-md border p-4">
            <h4 className="font-semibold mb-1">Sound Progress</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Compared with your analysis on {new Date(previous.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
            {soundProgress.length === 0 && (
              <p className="text-sm text-gray-700">Your sounds held steady - none moved by 5 points or more.</p>
            )}
            <div className="space-y-2">
              {soundProgress.map(s => (
                <div key={s.sound} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-base">/{s.sound}/</Badge>
                  <span className="text-gray-700">{s.before} → <span className={scoreText(s.now)}>{s.now}</span></span>
                  <span className={s.change > 0 ? 'text-green-600' : 'text-red-600'}>
                    {s.change > 0 ? `improved by ${s.change}` : `dropped by ${-s.change}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {measured?.timing && measured.timing.length > 0 && (
          <div className="rounded-md border p-4">
            <h4 className="font-semibold mb-1">Dragged & Rushed Words</h4>
            <p className="text-xs text-muted-foreground mb-3">Words held much longer, or said much faster, than your usual pace</p>
            <div className="space-y-1 text-sm">
              {measured.timing.map((t, i) => (
                <p key={i} className="text-gray-700">
                  • "{t.word}" - {t.kind === 'dragged'
                    ? `drawn out for ${t.seconds}s; keep it crisp unless you mean to stress it`
                    : `rushed in ${t.seconds}s; give each sound its time`}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Mispronounced Words from AI Analysis */}
        {mispronuncedWords.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-slate-900">
                  <Volume2 className="h-5 w-5" />
                  Pronunciation Mistakes
                  <Badge variant="secondary" className="ml-2 font-normal">
                    {mispronuncedWords.length} found
                  </Badge>
                </CardTitle>
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span>
                  {mispronuncedWords.some(w => typeof w.score === 'number')
                    ? `Each word in your audio is scored 0-100 for how closely its sounds match standard pronunciation. These scored lowest.`
                    : 'These words were estimated from your transcript, not scored from your audio.'}
                  {' '}Click play to hear them said correctly.
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {mispronuncedWords.map((mistake, index) => (
                <div
                  key={index}
                  className="p-4 bg-white rounded-lg border"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Incorrect vs Correct Words - when the word itself was mispronounced, just the word (and Azure's score, if any) */}
                      {mistake.correctWord === mistake.word ? (
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-bold text-lg text-red-600 dark:text-red-400">"{mistake.word}"</span>
                          {typeof mistake.score === 'number' && (
                            <Badge className={scoreBadge(mistake.score)}>Scored {mistake.score}/100</Badge>
                          )}
                        </div>
                      ) : (
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive" className="text-xs">Incorrect</Badge>
                          <span className="font-bold text-lg text-red-600 dark:text-red-400">
                            "{mistake.word}"
                          </span>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-xs bg-green-600">Correct</Badge>
                          <span className="font-bold text-lg text-green-600 dark:text-green-400">
                            "{mistake.correctWord}"
                          </span>
                        </div>
                      </div>
                      )}

                      {mistake.syllables && (
                        <div className="flex flex-wrap items-center gap-1 text-sm">
                          <span className="text-xs font-semibold text-muted-foreground uppercase mr-1">By syllable</span>
                          {mistake.syllables.map((syl, i) => (
                            <Badge key={i} className={`${scoreBadge(syl.score)}`}>{syl.text} {syl.score}</Badge>
                          ))}
                        </div>
                      )}

                      {/* Phonetics */}
                      {(mistake.phoneticPronounced || mistake.phoneticCorrect) && (
                      <div className={`grid grid-cols-1 ${mistake.phoneticPronounced ? 'md:grid-cols-2' : ''} gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md`}>
                        {mistake.phoneticPronounced && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                            Your Pronunciation
                          </div>
                          <div className="text-base text-red-600 dark:text-red-400">
                            {mistake.phoneticPronounced}
                          </div>
                        </div>
                        )}
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                            Correct Pronunciation
                          </div>
                          <div className="text-base text-green-600 dark:text-green-400">
                            {mistake.phoneticCorrect}
                          </div>
                        </div>
                      </div>
                      )}

                      {/* Suggestion */}
                      <div className="flex items-start gap-2 p-3 bg-accent/50 rounded-md border border-secondary/20">
                        <Lightbulb className="h-4 w-4 mt-0.5 text-stone-700 dark:text-secondary flex-shrink-0" />
                        <p className="text-sm text-stone-900">
                          <span className="font-semibold">Tip: </span>
                          {mistake.suggestion}
                        </p>
                      </div>
                    </div>

                    {/* Play Button */}
                    <Button
                      onClick={() => playPronunciation(mistake.correctWord)}
                      disabled={playingWord === mistake.correctWord}
                      variant="outline"
                      size="icon"
                      className="flex-shrink-0 h-12 w-12 rounded-full hover:bg-green-50 dark:hover:bg-green-950/20 border-green-600 dark:border-green-400"
                    >
                      {playingWord === mistake.correctWord ? (
                        <Loader2 className="h-5 w-5 animate-spin text-green-600 dark:text-green-400" />
                      ) : (
                        <Play className="h-5 w-5 text-green-600 dark:text-green-400" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Other Speech Issues */}
        {otherIssues.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3">Other Speech Issues</h4>
            <div className="space-y-2">
              {otherIssues.map((mistake, index) => (
                <div key={index} className="bg-yellow-50 border border-yellow-200 rounded p-2 text-sm">
                  <div className="font-medium capitalize">{mistake.type} Issue:</div>
                  <div className="text-gray-700">"{mistake.text}" - {mistake.suggestion}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations - only pronunciation/clarity; other areas have their own cards */}
        {pronunciationFeedback.length > 0 && (
          <div className="bg-accent/50 p-4 rounded-md">
            <h4 className="font-semibold text-stone-900 mb-2">Recommendations</h4>
            <ul className="text-sm text-stone-700 space-y-1">
              {pronunciationFeedback.map((feedback, index) => (
                <li key={index} className="flex items-start gap-1">
                  <span className="text-stone-700">•</span>
                  <span><strong>{feedback.category}:</strong> {feedback.feedback}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PronunciationAssessment;
