
import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Clock, Users, Upload } from 'lucide-react';
import { useSpeech, type SpeechConfig } from '@/context/SpeechContext';
import { useAuth } from '@/context/AuthContext';
import { useTrialMode } from '@/hooks/useTrialMode';
import { useClearPracticeConfigOnLeave } from '@/hooks/usePracticeConfig';
import { toastAnalysisError, fileToAudioBlob } from '@/lib/analysis';
import { saveSpeechAnalysis } from '@/utils/speechDataService';
import { analyzeWithSelectedProvider } from '@/utils/speechAnalysisUtils';
import { toast } from 'sonner';
import PracticeReport from './PracticeReport';
import AudioRecorder from '../AudioRecorder';

const publicSpeakingPrompt = (scenario: { situation: string; keyPoints: string[] }) =>
  `${scenario.situation} Key points to cover: ${scenario.keyPoints.join('; ')}.`;

interface PublicSpeakingProps {
  onBack: () => void;
}

const PublicSpeaking: React.FC<PublicSpeakingProps> = ({ onBack }) => {
  const [currentScenario, setCurrentScenario] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { speechConfig, setSpeechConfig, setSpeechData, setHasRecorded, setSavedAnalysisId, beginNewRequest, isCurrentRequest } = useSpeech();
  const { user } = useAuth();
  const { incrementUsage, isTrialExpired, getRemainingTries } = useTrialMode();
  const fileInputRef = useRef<HTMLInputElement>(null);
  useClearPracticeConfigOnLeave();

  const scenarios = [
    {
      title: "Student Council Speech",
      situation: "You're running for student council president and need to give a campaign speech to your fellow students.",
      audience: "200+ fellow students in the school auditorium",
      timeLimit: "3-4 minutes",
      purpose: "persuasive campaign speech",
      tone: "confident and inspiring",
      keyPoints: [
        "Introduce yourself and your qualifications",
        "Present 2-3 specific initiatives you want to implement",
        "Explain why students should vote for you",
        "End with a memorable call to action"
      ],
      tips: [
        "Start with an attention-grabbing opening",
        "Use 'we' and 'us' to connect with your audience",
        "Be specific about your plans and goals",
        "Show passion and authenticity"
      ]
    },
    {
      title: "Class Presentation",
      situation: "You're presenting your research project on environmental conservation to your class.",
      audience: "25 classmates and your teacher",
      timeLimit: "5-7 minutes",
      purpose: "educational presentation",
      tone: "informative and engaging",
      keyPoints: [
        "State your research question and why it matters",
        "Present your key findings with examples",
        "Discuss the implications of your research",
        "Suggest actions people can take"
      ],
      tips: [
        "Start with an interesting fact or statistic",
        "Use clear transitions between points",
        "Include real-world examples and evidence",
        "Maintain eye contact with your audience"
      ]
    },
    {
      title: "Club Welcome Speech",
      situation: "As the president of the Drama Club, you're welcoming new members at your first meeting.",
      audience: "15-20 new and returning club members",
      timeLimit: "2-3 minutes",
      purpose: "welcoming and motivational speech",
      tone: "enthusiastic and welcoming",
      keyPoints: [
        "Welcome everyone warmly to the club",
        "Share what makes the Drama Club special",
        "Outline exciting activities planned for the year",
        "Encourage questions and participation"
      ],
      tips: [
        "Use an enthusiastic and welcoming tone",
        "Share a personal story about the club",
        "Make everyone feel included and valued",
        "End with excitement about the year ahead"
      ]
    },
    {
      title: "Award Acceptance Speech",
      situation: "You've won the 'Student of the Month' award and need to give an acceptance speech at the school assembly.",
      audience: "Entire school - students, teachers, and staff",
      timeLimit: "2 minutes",
      purpose: "acceptance and gratitude speech",
      tone: "humble and inspiring",
      keyPoints: [
        "Express gratitude for the recognition",
        "Thank specific people who helped you",
        "Share what this award means to you",
        "Inspire others to pursue their goals"
      ],
      tips: [
        "Be humble and gracious",
        "Acknowledge others who supported you",
        "Keep it heartfelt and authentic",
        "End with an inspiring message"
      ]
    }
  ];

  const currentScenarioData = scenarios[currentScenario];

  const nextScenario = () => {
    setCurrentScenario((prev) => (prev + 1) % scenarios.length);
  };

  // Also keys this exercise's saved answers, so it must match what's sent for analysis.
  const practicePrompt = publicSpeakingPrompt(currentScenarioData);

  const scenarioConfig = (): SpeechConfig => ({
    topic: currentScenarioData.title,
    purpose: currentScenarioData.purpose,
    purposeKey: 'speech',
    audience: currentScenarioData.audience,
    duration: currentScenarioData.timeLimit,
    tone: currentScenarioData.tone,
    practicePrompt,
  });

  const startRecording = () => {
    // Set the speech configuration for this specific scenario
    setSpeechConfig(scenarioConfig());
    // Clear any leftover result from a previous mode/scenario so it can't
    // briefly (or permanently, if never re-recorded) show through here, and
    // invalidate any of that mode's analysis still in flight so it can't
    // land here later either.
    setSpeechData(null);
    setHasRecorded(false);
    setSavedAnalysisId(null);
    beginNewRequest();
  };
  // Ready to record as soon as the exercise is on screen - no extra "start" click.
  useEffect(startRecording, [practicePrompt]);

  // Returns whether analysis actually succeeded, so the upload handler doesn't
  // follow a failure with an "uploaded successfully" toast.
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
      toast.info('Analyzing your speech with AI...', { duration: 2000 });

      setSavedAnalysisId(null);
      const myRequestId = beginNewRequest();
      const analysis = await analyzeWithSelectedProvider(audioBlob, '', 'openai', scenarioConfig());

      if (!isCurrentRequest(myRequestId)) {
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

      if (user) {
        const title = `${currentScenarioData.title} - ${new Date().toLocaleDateString()}`;

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
        toast.warning("This recording was too short or unclear to score", {
          description: user ? undefined : "This attempt didn't use up a free try.",
        });
        return false;
      }

      toast.success('Analysis complete! Your speech has been analyzed with personalized coaching feedback.');
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
      const validTypes = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/m4a'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|webm|ogg|m4a)$/i)) {
        toast.error('Invalid file format. Please upload MP3, WAV, WEBM, OGG, or M4A files only.', {
          description: `File: ${fileName}`
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File too large. Maximum size is 10MB.', {
          description: `Your file is ${fileSizeMB}MB`
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      toast.info('Uploading audio file...', {
        description: `Processing ${fileName} (${fileSizeMB}MB)`
      });

      const audioBlob = await fileToAudioBlob(file);
      if (await handleRecordingComplete(audioBlob, 0)) {
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
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Practice
          </Button>
          <h1 className="text-3xl font-bold">Public Speaking Scenarios</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Scenario Content */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{currentScenarioData.title}</span>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="h-4 w-4" />
                    {currentScenarioData.timeLimit}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-accent/50 p-4 rounded-lg mb-6">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    The Situation:
                  </h3>
                  <p className="text-gray-700 mb-3">{currentScenarioData.situation}</p>
                  <div className="text-sm text-gray-600">
                    <strong>Audience:</strong> {currentScenarioData.audience}
                  </div>
                </div>

                <div className="bg-green-50 p-4 rounded-lg mb-4">
                  <h3 className="font-semibold mb-2">Key Points to Cover:</h3>
                  <ul className="space-y-2">
                    {currentScenarioData.keyPoints.map((point, index) => (
                      <li key={index} className="text-sm text-gray-700">
                        <span className="font-medium">{index + 1}.</span> {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-yellow-50 p-4 rounded-lg mb-6">
                  <h3 className="font-semibold mb-2">Speaking Tips:</h3>
                  <ul className="space-y-1">
                    {currentScenarioData.tips.map((tip, index) => (
                      <li key={index} className="text-sm text-gray-700">• {tip}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-accent/50 p-4 rounded-lg mb-6">
                  <h3 className="font-semibold mb-2">Your Challenge:</h3>
                  <p className="text-gray-700">
                    Imagine you're actually in this situation. Consider your audience, 
                    the setting, and the purpose of your speech. Structure your content 
                    with a clear beginning, middle, and end. Remember to speak with 
                    confidence and authenticity.
                  </p>
                </div>

                <div className="flex gap-4">
                  <Button variant="outline" onClick={nextScenario}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Try Another Scenario
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recording and Analysis */}
          <div className="space-y-6">
            <>
                <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-gray-50">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">Record Your {currentScenarioData.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">AI analysis for {currentScenarioData.purpose}</p>
                        </div>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <AudioRecorder
                      onRecordingComplete={handleRecordingComplete}
                      isAnalyzing={isAnalyzing}
                    />

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
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isAnalyzing}
                        variant="outline"
                        className="w-full"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Audio File
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        Supported formats: MP3, WAV, WEBM, OGG, M4A (max 10MB)
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </>
            <PracticeReport prompt={practicePrompt} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicSpeaking;
