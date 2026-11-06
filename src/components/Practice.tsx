
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Mic, Users, Trophy, Briefcase, MessageSquare, TrendingUp, Target } from 'lucide-react';

// Import existing practice components
import PublicSpeaking from './practice/PublicSpeaking';
import StoryTelling from './practice/StoryTelling';
import DebateTopics from './practice/DebateTopics';
import DescriptiveNarration from './practice/DescriptiveNarration';
import CreativeStorytelling from './practice/CreativeStorytelling';
import JobInterviews from './practice/JobInterviews';


const Practice: React.FC = () => {
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  // Define practice categories - Job Interviews first per the training-exercises priority
  const practiceCategories = {
    'job-interviews': {
      title: 'Job Interviews',
      icon: <Briefcase className="h-6 w-6" />,
      component: JobInterviews,
      description: 'Practice common interview scenarios and questions',
      difficulty: 'All Levels',
      duration: '15-30 min'
    },
    'public-speaking': {
      title: 'Public Speaking',
      icon: <Mic className="h-6 w-6" />,
      component: PublicSpeaking,
      description: 'Build confidence in formal presentations and speeches',
      difficulty: 'Intermediate',
      duration: '10-15 min'
    },
    'storytelling': {
      title: 'Storytelling',
      icon: <BookOpen className="h-6 w-6" />,
      component: StoryTelling,
      description: 'Master the art of engaging narrative delivery',
      difficulty: 'Beginner',
      duration: '5-10 min'
    },
    'debates': {
      title: 'Debate Topics',
      icon: <MessageSquare className="h-6 w-6" />,
      component: DebateTopics,
      description: 'Practice persuasive speaking and argumentation',
      difficulty: 'Advanced',
      duration: '15-20 min'
    },
    'descriptive': {
      title: 'Descriptive Narration',
      icon: <Users className="h-6 w-6" />,
      component: DescriptiveNarration,
      description: 'Enhance your descriptive speaking abilities',
      difficulty: 'Beginner',
      duration: '5-10 min'
    },
    'creative': {
      title: 'Creative Storytelling',
      icon: <Trophy className="h-6 w-6" />,
      component: CreativeStorytelling,
      description: 'Unleash creativity in impromptu storytelling',
      difficulty: 'Intermediate',
      duration: '10-15 min'
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'beginner': return 'bg-green-100 text-green-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-red-100 text-red-800';
      case 'all levels': return 'bg-accent text-stone-900';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleBackToPractice = () => {
    setSelectedExercise(null);
  };

  const PracticeCard = ({ categoryKey, category }: { categoryKey: string; category: any }) => (
    <Card key={categoryKey} className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              {category.icon}
            </div>
            <CardTitle className="text-lg">{category.title}</CardTitle>
          </div>
          <Badge className={getDifficultyColor(category.difficulty)}>
            {category.difficulty}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-gray-600 mb-4 leading-relaxed">
          {category.description}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Duration: {category.duration}
          </span>
          <Button 
            onClick={() => setSelectedExercise(categoryKey)}
            size="sm"
          >
            Start Practice
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (selectedExercise) {
    const selectedCategory = practiceCategories[selectedExercise as keyof typeof practiceCategories];
    const SelectedComponent = selectedCategory?.component;
    
    return (
      <div className="container mx-auto py-12">
        <div className="mb-6">
          <Button 
            variant="outline" 
            onClick={handleBackToPractice}
            className="mb-4"
          >
            ← Back to Practice Categories
          </Button>
        </div>
        {SelectedComponent && <SelectedComponent onBack={handleBackToPractice} />}
      </div>
    );
  }

  return (
    <div className="container mx-auto py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Practice Hub
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Improve your speaking skills with our comprehensive collection of practice exercises, 
          from basic storytelling to advanced job interview preparation.
        </p>
      </div>


      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All Exercises</TabsTrigger>
          <TabsTrigger value="beginner">Beginner</TabsTrigger>
          <TabsTrigger value="intermediate">Intermediate</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(practiceCategories).map(([key, category]) => (
              <PracticeCard key={key} categoryKey={key} category={category} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="beginner" className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(practiceCategories)
              .filter(([, category]) => category.difficulty.toLowerCase() === 'beginner')
              .map(([key, category]) => (
                <PracticeCard key={key} categoryKey={key} category={category} />
              ))}
          </div>
        </TabsContent>

        <TabsContent value="intermediate" className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(practiceCategories)
              .filter(([, category]) => category.difficulty.toLowerCase() === 'intermediate')
              .map(([key, category]) => (
                <PracticeCard key={key} categoryKey={key} category={category} />
              ))}
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(practiceCategories)
              .filter(([, category]) => category.difficulty.toLowerCase() === 'advanced')
              .map(([key, category]) => (
                <PracticeCard key={key} categoryKey={key} category={category} />
              ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Additional Features Section */}
      <div className="mt-16 text-center">
        <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardContent className="p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              Track Your Progress
            </h3>
            <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
              Every practice session is automatically analyzed and saved to your profile. 
              Monitor your improvement over time and identify areas for focused practice.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
              <div className="text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10 text-secondary"><TrendingUp className="h-5 w-5" /></span>
                <div className="text-sm text-gray-600 mt-2">Progress Tracking</div>
              </div>
              <div className="text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10 text-secondary"><Target className="h-5 w-5" /></span>
                <div className="text-sm text-gray-600 mt-2">Targeted Feedback</div>
              </div>
              <div className="text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10 text-secondary"><Trophy className="h-5 w-5" /></span>
                <div className="text-sm text-gray-600 mt-2">Achievement Goals</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Practice;
