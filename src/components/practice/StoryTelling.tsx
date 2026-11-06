
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Clock } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';
import { useClearPracticeConfigOnLeave } from '@/hooks/usePracticeConfig';
import PracticeReport from './PracticeReport';
import RecordSpeech from '../RecordSpeech';

interface StoryTellingProps {
  onBack: () => void;
}

const StoryTelling: React.FC<StoryTellingProps> = ({ onBack }) => {
  const [currentStory, setCurrentStory] = useState(0);
  const { setSpeechConfig, setSpeechData, setHasRecorded, setSavedAnalysisId, beginNewRequest } = useSpeech();
  useClearPracticeConfigOnLeave();

  const stories = [
    {
      title: "The Rabbit and the Tortoise",
      images: [
        { src: "https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308", alt: "Rabbit in a field", description: "A confident rabbit in a green meadow" },
        { src: "https://images.unsplash.com/photo-1759013078954-b1e6bb04f35d", alt: "Tortoise walking slowly", description: "A determined tortoise moving steadily" },
        { src: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4", alt: "Racing path", description: "A winding path through nature" },
        { src: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05", alt: "Finish line", description: "The finish line in the distance" }
      ],
      prompt: "Tell the classic story of the rabbit and tortoise race. Use these images to guide your narrative, focusing on the characters, their personalities, and the lesson learned.",
      tips: [
        "Describe each character's personality",
        "Use the images to set the scene",
        "Include dialogue between characters",
        "End with the moral of the story"
      ]
    },
    {
      title: "The Journey of a Seed",
      images: [
        { src: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b", alt: "Small seed", description: "A tiny seed full of potential" },
        { src: "https://images.unsplash.com/photo-1712342109846-a8fcb1c883ba", alt: "Sprouting plant", description: "First signs of life emerging" },
        { src: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e", alt: "Growing tree", description: "A young tree reaching skyward" },
        { src: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e", alt: "Mature tree", description: "A fully grown, majestic tree" }
      ],
      prompt: "Create a story about transformation and growth. Follow the journey of a seed becoming a mighty tree, including the challenges and triumphs along the way.",
      tips: [
        "Personify the seed with emotions",
        "Describe the environment around it",
        "Include obstacles like weather or animals",
        "Show the passage of time"
      ]
    },
    {
      title: "Ocean Adventure",
      images: [
        { src: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21", alt: "Ocean waves", description: "Peaceful ocean waves" },
        { src: "https://images.unsplash.com/photo-1559827260-dc66d52bef19", alt: "Colorful fish", description: "Vibrant tropical fish swimming" },
        { src: "https://images.unsplash.com/photo-1583212292454-1fe6229603b7", alt: "Coral reef", description: "Beautiful coral reef ecosystem" },
        { src: "https://images.unsplash.com/photo-1582967788606-a171c1080cb0", alt: "Treasure chest", description: "Mysterious treasure chest on sea floor" }
      ],
      prompt: "Tell an underwater adventure story. Create characters who explore the ocean depths, meet sea creatures, and discover hidden treasures.",
      tips: [
        "Create interesting underwater characters",
        "Describe the ocean environment vividly",
        "Include challenges of underwater exploration",
        "Build suspense around the treasure discovery"
      ]
    }
  ];

  const currentStoryData = stories[currentStory];

  const nextStory = () => {
    setCurrentStory((prev) => (prev + 1) % stories.length);
  };

  // Also keys this exercise's saved answers, so it must match what's sent for analysis.
  const practicePrompt = currentStoryData.prompt;

  const startRecording = () => {
    // Without this, analysis would use whatever config was left over from the
    // main page, and content feedback would ignore this exercise's prompt.
    setSpeechConfig(() => ({
      topic: currentStoryData.title,
      purpose: 'storytelling',
      purposeKey: 'speech',
      audience: 'General audience',
      duration: '2-3 minutes',
      tone: 'engaging and expressive',
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
          <h1 className="text-3xl font-bold">Story Through Images</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Story Content */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{currentStoryData.title}</span>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="h-4 w-4" />
                    5-8 minutes
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {currentStoryData.images.map((image, index) => (
                    <div key={index} className="relative">
                      <img 
                        src={image.src} 
                        alt={image.alt}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2 rounded-b-lg">
                        <p className="text-xs">{image.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-accent/50 p-4 rounded-lg mb-4">
                  <h3 className="font-semibold mb-2">Your Challenge:</h3>
                  <p className="text-gray-700">{currentStoryData.prompt}</p>
                </div>

                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Speaking Tips:</h3>
                  <ul className="space-y-1">
                    {currentStoryData.tips.map((tip, index) => (
                      <li key={index} className="text-sm text-gray-700">• {tip}</li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-4 mt-6">
                  <Button variant="outline" onClick={nextStory}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Try Another Story
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

export default StoryTelling;
