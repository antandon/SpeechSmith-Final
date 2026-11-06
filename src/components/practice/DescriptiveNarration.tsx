
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Clock, Eye } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';
import { useClearPracticeConfigOnLeave } from '@/hooks/usePracticeConfig';
import PracticeReport from './PracticeReport';
import RecordSpeech from '../RecordSpeech';

interface DescriptiveNarrationProps {
  onBack: () => void;
}

const DescriptiveNarration: React.FC<DescriptiveNarrationProps> = ({ onBack }) => {
  const [currentScene, setCurrentScene] = useState(0);
  const { setSpeechConfig, setSpeechData, setHasRecorded, setSavedAnalysisId, beginNewRequest } = useSpeech();
  useClearPracticeConfigOnLeave();

  const scenes = [
    {
      title: "Bustling Market Scene",
      image: "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a",
      description: "A vibrant local market filled with colorful fruits, vegetables, and busy shoppers",
      prompts: [
        "What colors do you see?",
        "What sounds would you hear?",
        "What smells might be in the air?",
        "How are people moving and interacting?",
        "What emotions or atmosphere do you sense?"
      ],
      tips: [
        "Use all five senses in your description",
        "Start with the overall scene, then focus on details",
        "Describe movement and activity",
        "Include the mood or atmosphere"
      ]
    },
    {
      title: "Cozy Library Corner",
      image: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570",
      description: "A quiet reading nook with books, warm lighting, and comfortable seating",
      prompts: [
        "How does the lighting affect the mood?",
        "What textures can you identify?",
        "What sounds (or lack of sounds) are present?",
        "How is the space organized?",
        "What feelings does this space evoke?"
      ],
      tips: [
        "Focus on creating a peaceful atmosphere",
        "Describe textures and materials",
        "Talk about the quality of light",
        "Mention what makes it feel cozy"
      ]
    },
    {
      title: "Stormy Ocean Shore",
      image: "https://images.unsplash.com/photo-1439066615861-d1af74d74000",
      description: "Dramatic coastline with crashing waves, dark clouds, and wild weather",
      prompts: [
        "How powerful are the waves?",
        "What does the sky look like?",
        "What sounds dominate the scene?",
        "How might the weather feel on your skin?",
        "What emotions does this scene evoke?"
      ],
      tips: [
        "Use dynamic, action-oriented language",
        "Describe the power and movement of nature",
        "Include weather effects",
        "Convey the drama and intensity"
      ]
    },
    {
      title: "Peaceful Garden Path",
      image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b",
      description: "A serene garden walkway surrounded by lush greenery and flowers",
      prompts: [
        "What plants and flowers do you notice?",
        "How does the path wind through the garden?",
        "What natural sounds might you hear?",
        "How does the light filter through the trees?",
        "What seasonal elements are present?"
      ],
      tips: [
        "Paint a picture with plant and flower descriptions",
        "Describe the journey along the path",
        "Include natural sounds and scents",
        "Create a sense of tranquility"
      ]
    }
  ];

  const currentSceneData = scenes[currentScene];

  const nextScene = () => {
    setCurrentScene((prev) => (prev + 1) % scenes.length);
  };

  // Also keys this exercise's saved answers, so it must match what's sent for analysis.
  const practicePrompt = `Describe this scene: ${currentSceneData.description}. Questions to address: ${currentSceneData.prompts.join(' ')}`;

  const startRecording = () => {
    // Without this, analysis would use whatever config was left over from the
    // main page, and content feedback would ignore this exercise's prompt.
    setSpeechConfig(() => ({
      topic: currentSceneData.title,
      purpose: 'descriptive narration',
      purposeKey: 'speech',
      audience: 'General audience',
      duration: '2-3 minutes',
      tone: 'vivid and descriptive',
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
  useEffect(startRecording, [practicePrompt]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Practice
          </Button>
          <h1 className="text-3xl font-bold">Descriptive Narration</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Scene Content */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{currentSceneData.title}</span>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="h-4 w-4" />
                    3-5 minutes
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <img 
                    src={currentSceneData.image} 
                    alt={currentSceneData.title}
                    className="w-full h-64 object-cover rounded-lg"
                  />
                  <p className="text-gray-600 mt-2 text-sm">{currentSceneData.description}</p>
                </div>

                <div className="bg-accent/50 p-4 rounded-lg mb-4">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Observation Prompts:
                  </h3>
                  <ul className="space-y-2">
                    {currentSceneData.prompts.map((prompt, index) => (
                      <li key={index} className="text-sm text-gray-700">• {prompt}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-green-50 p-4 rounded-lg mb-6">
                  <h3 className="font-semibold mb-2">Description Tips:</h3>
                  <ul className="space-y-1">
                    {currentSceneData.tips.map((tip, index) => (
                      <li key={index} className="text-sm text-gray-700">• {tip}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-yellow-50 p-4 rounded-lg mb-6">
                  <h3 className="font-semibold mb-2">Your Challenge:</h3>
                  <p className="text-gray-700">
                    Spend 3-5 minutes describing this scene in vivid detail. Imagine you're helping 
                    someone who can't see the image understand exactly what it looks like and feels like. 
                    Use sensory language and paint a complete picture with your words.
                  </p>
                </div>

                <div className="flex gap-4">
                  <Button variant="outline" onClick={nextScene}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Try Another Scene
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recording and Analysis */}
          <div className="space-y-6">
            {/* Plain wrapper: RecordSpeech is h-full, which would otherwise fill the stretched grid column and push the answers list past the page. */}
            <div>
                <RecordSpeech />
              </div>
            <PracticeReport prompt={practicePrompt} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DescriptiveNarration;
