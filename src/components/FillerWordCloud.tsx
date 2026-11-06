
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ArrowRight } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';

const FillerWordCloud: React.FC = () => {
  const { speechData, hasRecorded } = useSpeech();

  // Get filler words from speech data or generate from mistakes
  const getFillerWords = () => {
    if (!speechData) return [];

    // Use actual filler words from analytics if available
    if (speechData.analytics?.commonFillerWords?.length > 0) {
      return speechData.analytics.commonFillerWords;
    }

    // Extract from mistakes if analytics not available
    const fillerMistakes = speechData.mistakes?.filter(m => m.type === 'filler') || [];
    const fillerCounts: { [key: string]: number } = {};

    fillerMistakes.forEach(mistake => {
      const words = mistake.text.toLowerCase().split(' ');
      words.forEach(word => {
        const cleanWord = word.replace(/[.,!?;]/g, '');
        if (['um', 'uh', 'like', 'you know', 'actually', 'basically', 'literally', 'so', 'well', 'right'].includes(cleanWord)) {
          fillerCounts[cleanWord] = (fillerCounts[cleanWord] || 0) + 1;
        }
      });
    });

    return Object.entries(fillerCounts).map(([word, count]) => ({ word, count }));
  };

  const fillerWords = getFillerWords();
  const fillerOccurrences = speechData?.mistakes?.filter(m => m.type === 'filler') || [];

  // Calculate max count for sizing
  const maxCount = Math.max(...fillerWords.map(fw => fw.count), 1);

  // Get font size based on count
  const getFontSize = (count: number) => {
    const ratio = count / maxCount;
    return Math.max(12, Math.min(32, 12 + ratio * 20));
  };

  // Get color based on frequency
  const getColor = (count: number) => {
    const ratio = count / maxCount;
    if (ratio > 0.7) return 'text-red-600';
    if (ratio > 0.4) return 'text-orange-500';
    if (ratio > 0.2) return 'text-yellow-600';
    return 'text-secondary';
  };

  // Get opacity based on frequency
  const getOpacity = (count: number) => {
    const ratio = count / maxCount;
    return Math.max(0.5, ratio);
  };

  if (!hasRecorded || !speechData || fillerWords.length === 0) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><MessageSquare className="h-5 w-5" /></span>
            <span>Filler Words Analysis</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-10 text-gray-500">
          <p>
            {!hasRecorded 
              ? 'Record a speech to see filler word analysis' 
              : 'Great! No significant filler words detected in your speech.'
            }
          </p>
          {!hasRecorded && (
            <p className="text-sm mt-2">Common filler words like "um", "like", "you know" will be highlighted</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const totalFillerWords = fillerWords.reduce((sum, fw) => sum + fw.count, 0);
  const totalWords = speechData?.speechMetrics?.totalWords || 0;
  const fillerRate = totalWords > 0 ? Math.round((totalFillerWords / totalWords) * 1000) / 10 : null;
  // Up to ~2 per 100 words sounds natural; over 5 is distracting.
  const rateStyle = fillerRate === null ? ['bg-gray-50', 'text-gray-600', 'text-gray-700']
    : fillerRate <= 2 ? ['bg-green-50', 'text-green-600', 'text-green-700']
    : fillerRate <= 5 ? ['bg-amber-50', 'text-amber-600', 'text-amber-700']
    : ['bg-red-50', 'text-red-600', 'text-red-700'];

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><MessageSquare className="h-5 w-5" /></span>
          <span>Filler Words Analysis</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-red-50 p-3 rounded-md text-center">
            <div className="text-2xl font-bold text-red-600">{totalFillerWords}</div>
            <div className="text-sm text-red-700">Total Filler Words</div>
          </div>
          <div className="bg-accent/50 p-3 rounded-md text-center">
            <div className="text-2xl font-bold text-stone-700">{fillerWords.length}</div>
            <div className="text-sm text-stone-700">Unique Types</div>
          </div>
          <div className={`${rateStyle[0]} p-3 rounded-md text-center`}>
            <div className={`text-2xl font-bold ${rateStyle[1]}`}>
              {fillerRate !== null ? fillerRate : '-'}
            </div>
            <div className={`text-sm ${rateStyle[2]}`}>Fillers per 100 Words</div>
          </div>
        </div>

        {/* Word Cloud Visualization */}
        <div>
          <h4 className="font-semibold mb-3">Filler Word Cloud</h4>
          <div className="bg-gray-50 p-6 rounded-lg min-h-[200px] flex flex-wrap items-center justify-center gap-4">
            {fillerWords.map((fw, index) => (
              <div
                key={index}
                className={`font-bold select-none cursor-default transition-all hover:scale-110 ${getColor(fw.count)}`}
                style={{
                  fontSize: `${getFontSize(fw.count)}px`,
                  opacity: getOpacity(fw.count),
                  transform: `rotate(${((index * 37) % 21) - 10}deg)`
                }}
                title={`"${fw.word}" used ${fw.count} times`}
              >
                {fw.word}
              </div>
            ))}
          </div>
        </div>

        {/* Detailed List */}
        <div>
          <h4 className="font-semibold mb-3">Filler Word Breakdown</h4>
          <div className="space-y-2">
            {fillerWords
              .sort((a, b) => b.count - a.count)
              .map((fw, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={fw.count > 5 ? 'border-red-300 text-red-700' : 'border-yellow-300 text-yellow-700'}
                    >
                      "{fw.word}"
                    </Badge>
                    <span className="text-sm text-gray-600">
                      {fw.count > 5 ? 'High frequency' : fw.count > 2 ? 'Moderate' : 'Low frequency'}
                    </span>
                  </div>
                  <div className="text-sm font-medium">
                    {fw.count} time{fw.count !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Each occurrence, with words to say instead */}
        {fillerOccurrences.length > 0 && (
          <div>
            <h4 className="font-semibold mb-1">What to say instead</h4>
            <p className="text-xs text-gray-500 mb-3">Each filler from your recording, with words that fit that moment of your speech.</p>
            <div className="space-y-2">
              {fillerOccurrences.map((mistake, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 rounded border">
                  <span className="tabular-nums text-xs text-gray-500 w-10">{mistake.timestamp}</span>
                  <Badge className="bg-red-100 text-red-700 hover:bg-red-100">"{mistake.text}"</Badge>
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                  {mistake.alternatives && mistake.alternatives.length > 0 ? (
                    mistake.alternatives.map((alt, altIndex) => (
                      <Badge key={altIndex} variant="outline" className="border-green-300 text-green-800 bg-white">{alt}</Badge>
                    ))
                  ) : (
                    <span className="text-sm text-gray-700">{mistake.suggestion}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FillerWordCloud;
