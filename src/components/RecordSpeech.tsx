
import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSpeech } from '@/context/SpeechContext';
import { useAuth } from '@/context/AuthContext';
import { withIndefiniteArticle } from '@/lib/utils';
import { useTrialMode } from '@/hooks/useTrialMode';
import { saveSpeechAnalysis } from '@/utils/speechDataService';
import { analyzeWithSelectedProvider } from '@/utils/speechAnalysisUtils';
import { Mic, AlertCircle, Settings, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { toastAnalysisError, fileToAudioBlob } from '@/lib/analysis';
import { Alert, AlertDescription } from '@/components/ui/alert';
import AudioRecorder from './AudioRecorder';

interface RecordSpeechProps {
  // Called once a new analysis has landed in SpeechContext, e.g. to open its report.
  onAnalysisComplete?: () => void;
}

const RecordSpeech: React.FC<RecordSpeechProps> = ({ onAnalysisComplete }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setSpeechData, speechConfig, setHasRecorded, setSavedAnalysisId, setIsViewingHistorical, beginNewRequest, isCurrentRequest } = useSpeech();
  const { user } = useAuth();
  const { incrementUsage, isTrialExpired, getRemainingTries } = useTrialMode();
  // A config without a purpose isn't a speech context to show.
  const context = speechConfig?.purpose ? speechConfig : null;

  // Returns whether analysis actually succeeded - handleFileUpload needs this
  // to avoid showing a false "uploaded successfully" toast right after this
  // function already showed its own error toast for the same failure.
  const handleRecordingComplete = async (audioBlob: Blob, duration: number): Promise<boolean> => {
    if (!user && isTrialExpired) {
      toast.error('Free trial expired! Please sign up to continue.');
      return false;
    }

    if (!user) {
      const remaining = getRemainingTries();
      toast.info(`Free trial: ${remaining - 1} tries remaining after this analysis`);
    }

    try {
      setIsAnalyzing(true);
      
      const analysisMessage = context
        ? `Analyzing your ${context.purpose} with AI...`
        : 'Analyzing your speech with AI...';
      
      toast.info(analysisMessage, { duration: 2000 });
      
      setSavedAnalysisId(null);
      const myRequestId = beginNewRequest();
      const analysis = await analyzeWithSelectedProvider(audioBlob, '', 'openai', speechConfig);

      if (!isCurrentRequest(myRequestId)) {
        // User switched modes or started another recording while this was
        // in flight - discard rather than overwrite whatever they're looking at now.
        console.log('Discarding stale analysis result (superseded by a newer request)');
        return false;
      }

      setSpeechData({
        audioUrl: URL.createObjectURL(audioBlob),
        recordingDate: new Date().toISOString(),
        transcription: analysis.transcription,
        improvedTranscription: analysis.improvedTranscription,
        improvedTranscriptionClean: analysis.improvedTranscriptionClean,
        improvedAudioUrl: analysis.improvedAudioUrl,
        mistakes: analysis.mistakes,
        mispronuncedWords: analysis.mispronuncedWords,
        feedback: analysis.feedback,
        speechMetrics: analysis.speechMetrics,
        grammarAnalysis: analysis.grammarAnalysis,
        vocabularyAnalysis: analysis.vocabularyAnalysis,
        emphasisSuggestions: analysis.emphasisSuggestions,
        toneSuggestions: analysis.toneSuggestions,
        contentQualityAnalysis: analysis.contentQualityAnalysis,
        overallScore: analysis.overallScore,
        overallScoreRationale: analysis.overallScoreRationale,
        pitchAnalysis: analysis.toneAnalysis,
        emotionAnalysis: analysis.toneAnalysis,
        speechConfig: analysis.speechConfig,
        analytics: {
          dates: [],
          clarity: [],
          pace: [],
          fillerWords: [],
          structure: [],
          overallScores: [],
          categoryScores: analysis.analytics.categoryScores,
          commonFillerWords: analysis.analytics.commonFillerWords
        }
      });
      
      setHasRecorded(true);
      setIsViewingHistorical(false);
      onAnalysisComplete?.();

      if (user) {
        const title = context
          ? `${context.topic || context.purpose} - ${new Date().toLocaleDateString()}`
          : `Speech Analysis ${new Date().toLocaleDateString()}`;

        try {
          const saved = await saveSpeechAnalysis({
            audio: audioBlob,
            title,
            transcription: analysis.transcription,
            mistakes: analysis.mistakes,
            feedback: analysis.feedback,
            analytics: {
              ...analysis.analytics,
              improvedTranscription: analysis.improvedTranscription,
              improvedTranscriptionClean: analysis.improvedTranscriptionClean,
              improvedAudioUrl: analysis.improvedAudioUrl,
              pronunciationAccuracy: analysis.speechMetrics?.pronunciationAccuracy,
              mispronuncedWords: analysis.mispronuncedWords,
              speakingRate: analysis.speechMetrics,
              speechMetrics: analysis.speechMetrics,
              fillerWords: analysis.analytics?.commonFillerWords,
              pitchAnalysis: analysis.toneAnalysis,
              emotionAnalysis: analysis.toneAnalysis,
              grammarAnalysis: analysis.grammarAnalysis,
              vocabularyAnalysis: analysis.vocabularyAnalysis,
              emphasisSuggestions: analysis.emphasisSuggestions,
              toneSuggestions: analysis.toneSuggestions,
              contentQualityAnalysis: analysis.contentQualityAnalysis,
              overallScore: analysis.overallScore,
              overallScoreRationale: analysis.overallScoreRationale,
              speechConfig: analysis.speechConfig
            }
          });
          setSavedAnalysisId(saved.id);
        } catch (saveError) {
          // The report is already showing - don't call this an analysis failure.
          console.error('Save error:', saveError);
          toast.error("Analysis ready, but it couldn't be saved to your history.");
        }
      } else if (analysis.speechMetrics?.wordsPerMinute !== 0) {
        // A recording with no usable speech is a failed attempt - it doesn't use up a free try.
        incrementUsage();
      }
      
      // The report explains this case itself; don't call it a success.
      if (analysis.speechMetrics?.wordsPerMinute === 0) {
        toast.warning("We couldn't hear enough speech in this recording", {
          description: user ? undefined : "This attempt didn't use up a free try.",
        });
        return false;
      }

      const successMessage = context
        ? `Analysis complete! Your ${context.purpose} has been analyzed with personalized coaching feedback.`
        : 'Analysis complete! Check all sections for detailed feedback.';
        
      toast.success(successMessage);
      return true;
    } catch (error) {
      console.error('Analysis error:', error);
      toastAnalysisError(error);
      return false;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name;

    try {
      // Validate file type
      const validTypes = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/m4a'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|webm|ogg|m4a)$/i)) {
        toast.error('Invalid file format. Please upload MP3, WAV, WEBM, OGG, or M4A files only.', {
          description: `File: ${fileName}`
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Validate file size (max 10MB)
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File too large. Maximum size is 10MB.', {
          description: `Your file is ${fileSizeMB}MB`
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Show upload started message
      toast.info('Uploading audio file...', {
        description: `Processing ${fileName} (${fileSizeMB}MB)`
      });

      const audioBlob = await fileToAudioBlob(file);
      const succeeded = await handleRecordingComplete(audioBlob, 0);

      // handleRecordingComplete already showed its own success/error toast -
      // showing another one here regardless of outcome previously masked
      // real failures (e.g. unsupported file contents) behind a false "success".
      if (succeeded) {
        toast.success('Audio file uploaded successfully!', {
          description: `${fileName} has been analyzed`
        });
      }

    } catch (error) {
      console.error('File upload error:', error);
      toast.error('Failed to process audio file', {
        description: error instanceof Error ? error.message : 'Please try again or record directly'
      });
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <Card className="flex h-full flex-col shadow-lg shadow-slate-900/5">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="rounded-lg bg-secondary p-2 text-white">
              <Mic className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {context ? `Record Your ${context.topic || context.purpose}` : 'Record Your Speech'}
              </h3>
              <p className="mt-0.5 text-sm font-normal text-slate-500">
                {context
                  ? `AI analysis for ${context.purpose} · Audience: ${context.audience}`
                  : 'AI-powered comprehensive speech analysis'
                }
              </p>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-6 p-6">
        {context && (
          <Alert className="border-primary/15 bg-primary/5">
            <Settings className="h-4 w-4 text-primary" />
            <AlertDescription className="text-slate-700">
              <strong>Speech Context Set:</strong> Your speech will be analyzed specifically as {withIndefiniteArticle(context.purpose)} for {context.audience} with {withIndefiniteArticle(context.tone)} tone ({context.duration}).
            </AlertDescription>
          </Alert>
        )}

        <Alert className="border-secondary/20 bg-secondary/5">
          <AlertCircle className="h-4 w-4 text-secondary" />
          <AlertDescription className="text-slate-700">
            <strong>AI Coaching Included:</strong> Your speech will be analyzed for pronunciation, 
            filler words, pace, emotional delivery, and receive personalized coaching feedback.
          </AlertDescription>
        </Alert>

        <div className="flex flex-1 flex-col gap-4">
          {/* The record button takes up any extra height, centred, so the card has no empty gap. */}
          <div className="flex flex-1 flex-col justify-center">
            <AudioRecorder 
              onRecordingComplete={handleRecordingComplete}
              isAnalyzing={isAnalyzing}
            />
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border"></div>
            <span className="text-sm text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border"></div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.webm,.ogg,.m4a"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isAnalyzing}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isAnalyzing}
              className="group flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-5 transition-colors hover:border-secondary hover:bg-secondary/5 disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="rounded-full bg-white p-2.5 text-secondary shadow-sm ring-1 ring-slate-200 group-hover:ring-secondary/30">
                <Upload className="h-5 w-5" />
              </span>
              <span className="font-semibold text-slate-800">Upload Audio File</span>
              <span className="text-xs text-muted-foreground">
                Supported formats: MP3, WAV, WEBM, OGG, M4A (max 10MB)
              </span>
            </button>
          </div>
        </div>

        {isAnalyzing && (
          <div className="text-center bg-slate-50 px-6 py-3 rounded-lg border">
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <p className="text-slate-700 font-medium">
                {context
                  ? `Analyzing your ${context.purpose} with AI...`
                  : 'Analyzing speech with AI...'
                }
              </p>
            </div>
          </div>
        )}

        {!user && (
          <div className="text-center bg-slate-50 px-4 py-3 rounded-lg border">
            <p className="text-slate-800 font-medium">
              Free trial: {getRemainingTries()} recordings remaining
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Sign up for unlimited recordings and advanced features
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecordSpeech;
