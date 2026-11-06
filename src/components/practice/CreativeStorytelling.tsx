
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Clock, Lightbulb, Shuffle } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';
import { useClearPracticeConfigOnLeave } from '@/hooks/usePracticeConfig';
import PracticeReport from './PracticeReport';
import RecordSpeech from '../RecordSpeech';

interface CreativeStorytellingProps {
  onBack: () => void;
}

const CreativeStorytelling: React.FC<CreativeStorytellingProps> = ({ onBack }) => {
  const [currentPrompt, setCurrentPrompt] = useState(0);
  const { setSpeechConfig, setSpeechData, setHasRecorded, setSavedAnalysisId, beginNewRequest } = useSpeech();
  useClearPracticeConfigOnLeave();

  const prompts = [
    {
      title: "The Time Traveler's Dilemma",
      setup: "You've invented a time machine, but it can only make one trip and you can't return.",
      elements: {
        characters: ["A brilliant scientist", "A curious teenager", "An ancient historian"],
        settings: ["Victorian London", "Ancient Egypt", "The year 3024"],
        objects: ["A mysterious golden compass", "A letter from the future", "A vintage photograph"],
        conflicts: ["The machine is malfunctioning", "Someone else wants to use it", "You discover a terrible secret"]
      },
      challenge: "Create a 5-minute story about someone facing the biggest decision of their life. Include dialogue, describe the setting vividly, and build suspense leading to their choice."
    },
    {
      title: "The Magic Shop Mystery",
      setup: "You discover a shop that wasn't there yesterday, selling items that seem impossible.",
      elements: {
        characters: ["An eccentric shopkeeper", "A skeptical customer", "A magical creature in disguise"],
        settings: ["A hidden alley", "An ordinary shopping mall", "A floating island"],
        objects: ["A mirror that shows the future", "Shoes that make you invisible", "A book that writes itself"],
        conflicts: ["The price isn't money", "The items have unexpected side effects", "The shop is disappearing"]
      },
      challenge: "Tell a story about wonder and consequence. Focus on character development and build tension around the moral choices involved in magic."
    },
    {
      title: "The Last Library",
      setup: "In a world where books are extinct, you discover the last hidden library.",
      elements: {
        characters: ["A rebel librarian", "A book-hunting android", "A child who's never seen a book"],
        settings: ["Underground tunnels", "A floating space station", "A post-apocalyptic city"],
        objects: ["A self-reading book", "A memory crystal", "An ancient key"],
        conflicts: ["The authorities are closing in", "The books are deteriorating", "Someone wants to destroy it all"]
      },
      challenge: "Craft a story about preservation and hope. Include themes of knowledge, memory, and what we leave behind for future generations."
    },
    {
      title: "The Emotion Collector",
      setup: "You meet someone who collects emotions in small glass bottles for a mysterious purpose.",
      elements: {
        characters: ["A lonely collector", "Someone who's lost all feelings", "A person with too many emotions"],
        settings: ["A crystalline laboratory", "A bustling city square", "A quiet mountain cabin"],
        objects: ["Bottles of liquid starlight", "A emotion-detecting device", "A memory projector"],
        conflicts: ["Running out of rare emotions", "Emotions being stolen", "The collection is corrupting"]
      },
      challenge: "Explore what makes us human through storytelling. Focus on emotional depth and the complexity of feelings."
    }
  ];

  const currentPromptData = prompts[currentPrompt];

  const nextPrompt = () => {
    setCurrentPrompt((prev) => (prev + 1) % prompts.length);
  };

  const shufflePrompt = () => {
    const randomIndex = Math.floor(Math.random() * prompts.length);
    setCurrentPrompt(randomIndex);
  };

  // Also keys this exercise's saved answers, so it must match what's sent for analysis.
  const practicePrompt = `${currentPromptData.setup} ${currentPromptData.challenge}`;

  const startRecording = () => {
    // Without this, analysis would use whatever config was left over from the
    // main page, and content feedback would ignore this exercise's prompt.
    setSpeechConfig(() => ({
      topic: currentPromptData.title,
      purpose: 'creative storytelling',
      purposeKey: 'speech',
      audience: 'General audience',
      duration: '5 minutes',
      tone: 'imaginative and engaging',
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
          <h1 className="text-3xl font-bold">Creative Storytelling</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Prompt Content */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{currentPromptData.title}</span>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="h-4 w-4" />
                    10-15 minutes
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-accent/50 p-4 rounded-lg mb-6">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    Story Setup:
                  </h3>
                  <p className="text-gray-700">{currentPromptData.setup}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-accent/50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2 text-stone-900">Characters</h4>
                    <ul className="space-y-1">
                      {currentPromptData.elements.characters.map((character, index) => (
                        <li key={index} className="text-sm text-gray-700">• {character}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2 text-green-800">Settings</h4>
                    <ul className="space-y-1">
                      {currentPromptData.elements.settings.map((setting, index) => (
                        <li key={index} className="text-sm text-gray-700">• {setting}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2 text-yellow-800">Objects</h4>
                    <ul className="space-y-1">
                      {currentPromptData.elements.objects.map((object, index) => (
                        <li key={index} className="text-sm text-gray-700">• {object}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-red-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2 text-red-800">Conflicts</h4>
                    <ul className="space-y-1">
                      {currentPromptData.elements.conflicts.map((conflict, index) => (
                        <li key={index} className="text-sm text-gray-700">• {conflict}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="bg-orange-50 p-4 rounded-lg mb-6">
                  <h3 className="font-semibold mb-2">Your Creative Challenge:</h3>
                  <p className="text-gray-700">{currentPromptData.challenge}</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <h3 className="font-semibold mb-2">Storytelling Tips:</h3>
                  <ul className="space-y-1 text-sm text-gray-700">
                    <li>• Choose 1-2 elements from each category to build your story</li>
                    <li>• Start with a hook that grabs attention immediately</li>
                    <li>• Develop your main character's motivations and personality</li>
                    <li>• Build tension throughout and resolve it satisfyingly</li>
                    <li>• Use descriptive language to create vivid scenes</li>
                    <li>• Include dialogue to bring characters to life</li>
                  </ul>
                </div>

                <div className="flex gap-4">
                  <Button variant="outline" onClick={shufflePrompt}>
                    <Shuffle className="h-4 w-4 mr-2" />
                    Random Prompt
                  </Button>
                  <Button variant="outline" onClick={nextPrompt}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Next Prompt
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

export default CreativeStorytelling;
