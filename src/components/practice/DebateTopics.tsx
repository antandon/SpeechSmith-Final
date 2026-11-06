
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Clock, Users } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';
import { useClearPracticeConfigOnLeave } from '@/hooks/usePracticeConfig';
import PracticeReport from './PracticeReport';
import RecordSpeech from '../RecordSpeech';

interface DebateTopicsProps {
  onBack: () => void;
}

const DebateTopics: React.FC<DebateTopicsProps> = ({ onBack }) => {
  const [currentTopic, setCurrentTopic] = useState(0);
  const [selectedSide, setSelectedSide] = useState<'for' | 'against' | null>(null);
  const { setSpeechConfig, setSpeechData, setHasRecorded, setSavedAnalysisId, beginNewRequest } = useSpeech();
  useClearPracticeConfigOnLeave();

  const topics = [
    {
      title: "School Uniforms",
      question: "Should schools require students to wear uniforms?",
      context: "Many schools worldwide debate whether uniforms create equality and focus, or limit individual expression.",
      forArguments: [
        "Reduces bullying based on clothing",
        "Creates sense of school unity",
        "Eliminates morning clothing decisions",
        "More cost-effective for families"
      ],
      againstArguments: [
        "Limits personal expression and creativity",
        "Can be expensive for families",
        "Doesn't address real causes of bullying",
        "Restricts comfort and individual choice"
      ]
    },
    {
      title: "Social Media Age Limits",
      question: "Should there be stricter age limits for social media platforms?",
      context: "With growing concerns about mental health and online safety, many debate whether current age restrictions are sufficient.",
      forArguments: [
        "Protects children from cyberbullying",
        "Prevents exposure to inappropriate content",
        "Reduces screen time addiction",
        "Allows proper mental development"
      ],
      againstArguments: [
        "Limits educational opportunities online",
        "Restricts social connections with peers",
        "Difficult to enforce effectively",
        "Parents should decide, not platforms"
      ]
    },
    {
      title: "Homework on Weekends",
      question: "Should students be given homework over weekends?",
      context: "The debate over weekend homework involves balancing academic progress with student well-being and family time.",
      forArguments: [
        "Maintains learning momentum",
        "Helps develop time management skills",
        "Prepares for real-world responsibilities",
        "Allows practice of difficult concepts"
      ],
      againstArguments: [
        "Students need rest and recreation time",
        "Family time is equally important",
        "Can increase stress and anxiety",
        "Weekend activities teach other valuable skills"
      ]
    },
    {
      title: "Junk Food in Schools",
      question: "Should junk food be completely banned from school cafeterias?",
      context: "Schools balance student preferences, health concerns, and practical considerations when deciding cafeteria menus.",
      forArguments: [
        "Promotes healthier eating habits",
        "Reduces childhood obesity rates",
        "Improves student concentration and energy",
        "Schools should model good nutrition"
      ],
      againstArguments: [
        "Students should learn to make choices",
        "Complete bans may increase rebellion",
        "Some 'junk food' can be part of balanced diet",
        "May reduce cafeteria revenue and participation"
      ]
    }
  ];

  const currentTopicData = topics[currentTopic];

  const nextTopic = () => {
    setCurrentTopic((prev) => (prev + 1) % topics.length);
    setSelectedSide(null);
  };

  const selectSide = (side: 'for' | 'against') => {
    setSelectedSide(side);
  };

  // Also keys this exercise's saved answers, so it must match what's sent for analysis.
  const practicePrompt = `${currentTopicData.question} The speaker is arguing ${selectedSide === 'for' ? 'FOR' : 'AGAINST'} this.`;

  const startRecording = () => {
    // Without this, analysis would use whatever config was left over from the
    // main page, and content feedback would ignore this exercise's prompt.
    setSpeechConfig(() => ({
      topic: currentTopicData.title,
      purpose: 'debate argument',
      purposeKey: 'speech',
      audience: 'Debate judges and audience',
      duration: '2-3 minutes',
      tone: 'persuasive and confident',
      practicePrompt,
    }));
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
  useEffect(() => { if (selectedSide) startRecording(); }, [practicePrompt, selectedSide]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Practice
          </Button>
          <h1 className="text-3xl font-bold">Debate & Arguments</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Topic Content */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{currentTopicData.title}</span>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="h-4 w-4" />
                    8-12 minutes
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-accent/50 p-4 rounded-lg mb-6">
                  <h3 className="font-semibold mb-2">Debate Question:</h3>
                  <p className="text-lg text-gray-800">{currentTopicData.question}</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <h3 className="font-semibold mb-2">Context:</h3>
                  <p className="text-gray-700">{currentTopicData.context}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <Card 
                    className={`cursor-pointer transition-all ${selectedSide === 'for' ? 'ring-2 ring-green-500 bg-green-50' : 'hover:shadow-md'}`}
                    onClick={() => selectSide('for')}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg text-green-600 flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Argue FOR
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {currentTopicData.forArguments.map((arg, index) => (
                          <li key={index} className="text-sm text-gray-700">• {arg}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  <Card 
                    className={`cursor-pointer transition-all ${selectedSide === 'against' ? 'ring-2 ring-red-500 bg-red-50' : 'hover:shadow-md'}`}
                    onClick={() => selectSide('against')}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg text-red-600 flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Argue AGAINST
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {currentTopicData.againstArguments.map((arg, index) => (
                          <li key={index} className="text-sm text-gray-700">• {arg}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>

                {selectedSide && (
                  <div className={`p-4 rounded-lg mb-4 ${selectedSide === 'for' ? 'bg-green-50' : 'bg-red-50'}`}>
                    <h3 className="font-semibold mb-2">Your Challenge:</h3>
                    <p className="text-gray-700">
                      You're arguing <strong>{selectedSide === 'for' ? 'FOR' : 'AGAINST'}</strong> the topic. 
                      Build a compelling 2-3 minute argument using the points provided as inspiration. 
                      Include personal examples, logical reasoning, and a strong conclusion.
                    </p>
                  </div>
                )}

                <div className="flex gap-4">
                  <Button variant="outline" onClick={nextTopic}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Try Another Topic
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recording and Analysis */}
          <div className="space-y-6">
            {selectedSide ? (
              <div>
                {/* Plain wrapper: RecordSpeech is h-full, which would otherwise fill the stretched grid column and push the answers list past the page. */}
                <RecordSpeech />
              </div>
            ) : (
              <Card className="h-96 flex items-center justify-center">
                <CardContent className="text-center">
                  <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="h-8 w-8 text-gray-500" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Choose Your Side</h3>
                  <p className="text-gray-600 mb-4">
                    {!selectedSide 
                      ? "Select whether you want to argue FOR or AGAINST the topic, then start recording your argument."
                      : "Great choice! Now click 'Start Your Argument' to begin recording your debate speech."
                    }
                  </p>
                </CardContent>
              </Card>
            )}
            {selectedSide && <PracticeReport prompt={practicePrompt} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebateTopics;
