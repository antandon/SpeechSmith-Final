
import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSpeech } from '@/context/SpeechContext';
import { Speech, AlertTriangle, CheckCircle, Lightbulb, Sparkles, Volume2, Clock, Zap, Play, Pause, AlertCircle, MessageSquare, CheckCircle2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import RenderedSpeechMarkup from '@/components/RenderedSpeechMarkup';
import HighlightedTranscript from '@/components/HighlightedTranscript';


// Keyed on the recording, so a new or reopened report starts with its own
// audio and play state rather than the previous report's.
const SpeechTranscript: React.FC = () => {
  const { speechData } = useSpeech();
  return <SpeechTranscriptView key={speechData?.recordingDate} />;
};

const SpeechTranscriptView: React.FC = () => {
  const { speechData } = useSpeech();
  // Playback is American English only - audio saved in another accent by older reports is dropped and re-made on play.
  const isUS = (speechData?.speechConfig?.accent ?? (speechData?.emotionAnalysis ?? speechData?.pitchAnalysis)?.measured?.accent ?? 'en-US') === 'en-US';
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recordingRef = useRef<HTMLAudioElement>(null);
  
  // State for corrected speech audio
  const [correctedAudioUrl, setCorrectedAudioUrl] = useState(isUS ? speechData?.improvedAudioUrl ?? '' : '');
  const [isPlayingCorrected, setIsPlayingCorrected] = useState(false);
  const [isGeneratingCorrectedAudio, setIsGeneratingCorrectedAudio] = useState(false);
  const correctedAudioRef = useRef<HTMLAudioElement>(null);

  const transcription = speechData?.transcription || '';
  const mistakes = speechData?.mistakes || [];
  const improvedTranscription = speechData?.improvedTranscription || '';
  const [improvedAudioUrl, setImprovedAudioUrl] = useState(isUS ? speechData?.improvedAudioUrl ?? '' : '');

  // Blob URLs this component generated (the report's own URLs belong to speechData) -
  // freed when replaced or when the report changes.
  const ownUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = ownUrls.current;
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, []);

  // An empty improved speech means it isn't ready yet; any text is the real thing.
  const hasValidImprovedSpeech = improvedTranscription.trim() !== '';

  // Check for multiple speakers in the transcript
  const checkMultipleSpeakers = (text: string): boolean => {
    const speakerIndicators = [
      /\b(speaker|person)\s*[12]/i,
      /\b(male|female)\s*voice/i,
      /\btwo\s*(people|voices|speakers)/i,
      /\bmultiple\s*speakers/i
    ];
    
    return speakerIndicators.some(pattern => pattern.test(text));
  };

  const hasMultipleSpeakers = checkMultipleSpeakers(transcription);

  // Generate coaching tips based on analysis
  const generateCoachingTips = () => {
    const tips = [];
    
    if (mistakes.some(m => m.type === 'pace')) {
      tips.push('**Speaking Pace:** Slow down for emphasis on key points. Vary your pace to maintain engagement.');
    }
    
    // Tips are rendered via dangerouslySetInnerHTML below, so convert the
    // **bold** markdown to real HTML rather than leaving literal asterisks.
    return tips.map((tip) => tip.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
  };

  const coachingTips = generateCoachingTips();

  // Only one clip plays at a time - starting one (or switching tabs) stops the rest.
  const stopAudio = (except?: HTMLAudioElement | null) => {
    [recordingRef, audioRef, correctedAudioRef].forEach(ref => {
      if (ref.current && ref.current !== except) ref.current.pause();
    });
    setIsPlaying(false);
    setIsPlayingCorrected(false);
  };

  const play = (el: HTMLAudioElement, setPlaying: (p: boolean) => void) => {
    stopAudio(el);
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  // Voices `text` in American English; a failure leaves the previous audio in place.
  const regenerate = async (
    text: string,
    currentUrl: string,
    setUrl: (url: string) => void,
    setGenerating: (generating: boolean) => void,
  ): Promise<string | undefined> => {
    stopAudio();
    setGenerating(true);
    try {
      const { generateSpeechFromText } = await import('@/utils/openaiTTS');
      const audioResult = await generateSpeechFromText(text, 'nova');
      if (audioResult.success && audioResult.audioUrl) {
        if (ownUrls.current.delete(currentUrl)) URL.revokeObjectURL(currentUrl);
        ownUrls.current.add(audioResult.audioUrl);
        setUrl(audioResult.audioUrl);
        return audioResult.audioUrl;
      }
    } catch (error) {
      console.error('❌ Error generating audio:', error);
    } finally {
      setGenerating(false);
    }
  };

  // Improved speech audio (marked-up text, so pauses/stress are voiced)
  const generateImprovedAudio = async () => {
    const text = speechData?.improvedTranscription || speechData?.improvedTranscriptionClean;
    if (!text) return;
    return regenerate(text, improvedAudioUrl, setImprovedAudioUrl, setIsGeneratingAudio);
  };

  // Corrected speech audio - sends the marked-up text so pauses/stress are
  // voiced; the TTS function strips it where it can't.
  const generateCorrectedAudio = async () => {
    if (!speechData?.improvedTranscriptionClean) return;
    const text = speechData.improvedTranscription || speechData.improvedTranscriptionClean;
    return regenerate(text, correctedAudioUrl, setCorrectedAudioUrl, setIsGeneratingCorrectedAudio);
  };

  const playFresh = (el: HTMLAudioElement, url: string | undefined, setPlaying: (p: boolean) => void) => {
    if (!url) return;
    // React sets the new src; play once it has loaded.
    el.addEventListener('canplay', () => play(el, setPlaying), { once: true });
  };

  // Past sessions don't keep generated audio - make it on first play.
  const toggle = async (
    el: HTMLAudioElement | null,
    url: string,
    playing: boolean,
    setPlaying: (p: boolean) => void,
    generate: () => Promise<string | undefined>,
  ) => {
    if (!el) return;
    if (!url) return playFresh(el, await generate(), setPlaying);
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      play(el, setPlaying);
    }
  };

  // Audio player functionality for improved speech
  const toggleAudioPlayback = () =>
    toggle(audioRef.current, improvedAudioUrl, isPlaying, setIsPlaying, generateImprovedAudio);

  // Audio player functionality for corrected speech
  const toggleCorrectedAudioPlayback = () =>
    toggle(correctedAudioRef.current, correctedAudioUrl, isPlayingCorrected, setIsPlayingCorrected, generateCorrectedAudio);

  // Render the improved speech with the AI coach's markup: | pauses,
  // **bold** emphasis, *italic* slow-down, and [[highlighted]] vocab/pronunciation words.
  const renderImprovedSpeech = (text: string) => {
    if (!text) return null;

    return (
      <RenderedSpeechMarkup
        text={text}
        className="text-gray-800 leading-relaxed text-lg font-medium whitespace-pre-wrap"
      />
    );
  };

  if (!speechData?.hasOwnProperty('transcription')) {
    return (
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-3 text-lg font-semibold text-slate-900">
            <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><Speech className="h-5 w-5" /></span>
            <span>Speech Transcript & AI Coaching</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-16">
          <div className="text-gray-500">
            <Speech className="h-20 w-20 mx-auto mb-6 opacity-30" />
            <p className="text-xl font-semibold">No Speech Recorded Yet</p>
            <p className="text-lg mt-3 text-gray-400">Record your speech to receive AI coaching and feedback</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Multiple Speaker Warning */}
      {hasMultipleSpeakers && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-amber-100 p-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <h4 className="font-semibold text-amber-900">Multiple Speakers Detected</h4>
                <p className="mt-1 text-sm text-amber-800">
                  Please record again with only one person speaking for accurate analysis.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Transcript Card */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-3 text-lg font-semibold text-slate-900">
            <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><Speech className="h-5 w-5" /></span>
            <span>Speech Analysis & AI Coaching</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {!transcription ? (
            // The report only exists once analysis finished, so an empty transcript means nothing was heard.
            <p className="text-center py-12 text-gray-500">No speech was transcribed from this recording.</p>
          ) : (
            <Tabs defaultValue="original" className="w-full" onValueChange={() => stopAudio()}>
              <TabsList className="grid w-full grid-cols-2 mb-6 h-11">
                <TabsTrigger value="original" className="flex items-center gap-2 h-9">
                  <AlertTriangle className="h-4 w-4" />
                  Your Original Speech
                </TabsTrigger>
                <TabsTrigger value="enhanced" className="flex items-center gap-2 h-9">
                  <Sparkles className="h-4 w-4" />
                  SpeechSmith Improved Version
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="original" className="space-y-6">
                {/* Original Audio Playback */}
                {!speechData.audioUrl && (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
                    The audio recording isn't kept for past sessions - only the transcript below.
                  </p>
                )}
                {speechData.audioUrl && (
                  <div className="rounded-lg border bg-slate-50 p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="rounded-md border bg-white p-2">
                        <Volume2 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900">Your Original Recording</h4>
                        <p className="text-slate-500 text-sm">Listen to your original audio recording</p>
                      </div>
                    </div>
                    
                    <audio ref={recordingRef} controls className="w-full" src={speechData.audioUrl} onPlay={(e) => stopAudio(e.currentTarget)}>
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                )}

                {/* Original Speech Section */}
                {speechData.transcription && (
                  <div className="rounded-lg border bg-white p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <MessageSquare className="h-4 w-4 text-slate-400" />
                      <h4 className="font-semibold text-slate-900">Original Speech</h4>
                    </div>
                    <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {speechData.transcription}
                    </p>
                  </div>
                )}

                <div className="rounded-lg border bg-white p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <h4 className="font-semibold text-slate-900">Your Original Speech (Issues Highlighted)</h4>
                  </div>
                  <HighlightedTranscript text={transcription} />
                </div>
              </TabsContent>
              
              <TabsContent value="enhanced" className="space-y-6">
                {/* Corrected Speech Section */}
                {speechData.improvedTranscriptionClean && (
                  <div className="rounded-lg border bg-slate-50 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <div>
                          <h4 className="font-semibold text-slate-900">Improved Speech</h4>
                          <p className="text-slate-500 text-sm">Your own points, reworded and restructured for impact - fillers removed, errors fixed, nothing new added</p>
                        </div>
                      </div>
                      <Button
                        onClick={toggleCorrectedAudioPlayback}
                        disabled={isGeneratingCorrectedAudio}
                        
                      >
                        {isGeneratingCorrectedAudio ? (
                          <>
                            <Clock className="h-5 w-5 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : isPlayingCorrected ? (
                          <>
                            <Pause className="h-5 w-5 mr-2" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="h-5 w-5 mr-2" />
                            Play
                          </>
                        )}
                      </Button>
                    </div>
                    
                    <audio
                      ref={correctedAudioRef}
                      src={correctedAudioUrl}
                      onEnded={() => setIsPlayingCorrected(false)}
                      className="hidden"
                    />

                    <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {speechData.improvedTranscriptionClean}
                    </p>
                  </div>
                )}

                <div className="rounded-lg border bg-white p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <Sparkles className="h-4 w-4 text-slate-400" />
                    <h4 className="font-semibold text-slate-900">SpeechSmith Improved Version</h4>
                    {hasValidImprovedSpeech && speechData?.speechMetrics?.wordsPerMinute !== 0 && (
                      <Badge variant="outline" className="font-normal text-slate-500">Professionally Enhanced</Badge>
                    )}
                  </div>
                  
                  {hasValidImprovedSpeech ? (
                    <div className="space-y-6">
                      {/* Audio Player for Improved Speech - only for older sessions (audio made on first play); otherwise the Improved Speech card above plays it */}
                      {!speechData.improvedTranscriptionClean && (
                        <div className="rounded-lg border bg-slate-50 p-4 space-y-4">
                          <div className="flex items-center gap-4 flex-wrap">
                            <Button
                              onClick={toggleAudioPlayback}
                              disabled={isGeneratingAudio}
                            >
                              {isPlaying ? (
                                <Pause className="h-5 w-5 mr-2" />
                              ) : (
                                <Play className="h-5 w-5 mr-2" />
                              )}
                              {isGeneratingAudio ? 'Generating...' : isPlaying ? 'Pause' : 'Play'} Improved Speech
                            </Button>
                            <div className="flex items-center gap-2 text-slate-600">
                              <Volume2 className="h-4 w-4" />
                               <span className="text-sm font-medium">
                                Listen to your improved speech
                              </span>
                            </div>
                          </div>
                          
                          <audio
                            ref={audioRef}
                            src={improvedAudioUrl}
                            onEnded={() => setIsPlaying(false)}
                            style={{ display: 'none' }}
                          />
                        </div>
                      )}
                      
                      <div className="prose max-w-none">
                        {renderImprovedSpeech(improvedTranscription)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="animate-pulse flex flex-col items-center">
                        <Sparkles className="h-10 w-10 text-slate-300 mb-4" />
                        <p className="text-slate-700 font-medium">SpeechSmith is analyzing your speech...</p>
                        <p className="text-slate-500 text-sm mt-2">Creating your improved version with delivery cues and emphasis</p>
                      </div>
                    </div>
                  )}
                </div>


                {/* Speech Coaching Tips */}
                {coachingTips.length > 0 && hasValidImprovedSpeech && (
                  <div className="rounded-lg border bg-white p-5">
                    <h5 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-slate-400" />
                      Personalized Speech Coaching
                    </h5>
                    <div className="space-y-4">
                      {coachingTips.map((tip, index) => (
                        <div key={index} className="flex items-start gap-3 rounded-md bg-slate-50 p-3">
                          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <div className="text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: tip }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

    </div>
  );
};

export default SpeechTranscript;
