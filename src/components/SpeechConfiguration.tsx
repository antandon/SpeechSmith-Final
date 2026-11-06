
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Settings, Target, Clock, Mic, Users, FileText, BookOpen } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';
import { type SpeechPurposeKey } from '@/context/SpeechContext';
import { toast } from 'sonner';

const PURPOSE_OPTIONS: { value: SpeechPurposeKey; label: string }[] = [
  { value: 'job-interview', label: 'Job Interview' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'speech', label: 'Speech' },
  { value: 'reading-exercise', label: 'Reading Exercise' },
  { value: 'other', label: 'Other' },
];

const AUDIENCE_OPTIONS = [
  { value: 'classmates', label: 'Classmates/Colleagues' },
  { value: 'teachers', label: 'Teachers/Professors' },
  { value: 'general', label: 'General Public' },
  { value: 'other', label: 'Other' },
];

const DURATION_OPTIONS = [
  { value: 'less-than-1min', label: 'Less than 1 min' },
  { value: '1-3mins', label: '1-3 mins' },
  { value: '3-5mins', label: '3-5 mins' },
  { value: 'more-than-5mins', label: 'More than 5 mins' },
  { value: 'other', label: 'Other' },
];

const TONE_OPTIONS = [
  { value: 'formal', label: 'Formal' },
  { value: 'informal', label: 'Informal' },
  { value: 'persuasive', label: 'Persuasive' },
  { value: 'other', label: 'Other' },
];

interface FormState {
  topic: string;
  purpose: string;
  purposeOther: string;
  audience: string;
  audienceOther: string;
  duration: string;
  durationOther: string;
  tone: string;
  toneOther: string;
  additionalContext: string;
  readingPassage: string;
}

const emptyForm: FormState = {
  topic: '',
  purpose: '',
  purposeOther: '',
  audience: '',
  audienceOther: '',
  duration: '',
  durationOther: '',
  tone: '',
  toneOther: '',
  additionalContext: '',
  readingPassage: '',
};

const resolveOptionValue = (
  selected: string,
  otherText: string,
  options: { value: string; label: string }[]
): string => {
  if (selected === 'other') return otherText.trim();
  return options.find((o) => o.value === selected)?.label ?? selected;
};

// Saved configs hold option labels; map one back to the select value (or "other" + its text).
const toOption = (label: string, options: { value: string; label: string }[]): [string, string] => {
  const option = options.find((o) => o.label === label && o.value !== 'other');
  return option ? [option.value, ''] : label ? ['other', label] : ['', ''];
};

const SpeechConfiguration: React.FC = () => {
  const { speechConfig, setSpeechConfig } = useSpeech();
  // Reopen the form on the setup the user last saved (it's kept across reloads).
  const [formData, setFormData] = useState<FormState>(() => {
    const c = speechConfig;
    if (!c?.purpose || c.practicePrompt) return emptyForm;
    const [audience, audienceOther] = toOption(c.audience, AUDIENCE_OPTIONS);
    const [duration, durationOther] = toOption(c.duration, DURATION_OPTIONS);
    const [tone, toneOther] = toOption(c.tone, TONE_OPTIONS);
    return {
      topic: c.topic, purpose: c.purposeKey, purposeOther: c.purposeKey === 'other' ? c.purpose : '',
      audience, audienceOther, duration, durationOther, tone, toneOther,
      additionalContext: c.additionalContext ?? '', readingPassage: c.readingPassage ?? '',
    };
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.purpose || !formData.audience || !formData.duration || !formData.tone) {
      toast.error('Please fill in all fields');
      return;
    }

    if (formData.purpose === 'other' && !formData.purposeOther.trim()) {
      toast.error('Please describe the purpose');
      return;
    }
    if (formData.audience === 'other' && !formData.audienceOther.trim()) {
      toast.error('Please describe the audience');
      return;
    }
    if (formData.duration === 'other' && !formData.durationOther.trim()) {
      toast.error('Please describe the duration');
      return;
    }
    if (formData.tone === 'other' && !formData.toneOther.trim()) {
      toast.error('Please describe the tone');
      return;
    }

    setSpeechConfig({
      topic: formData.topic,
      purpose: resolveOptionValue(formData.purpose, formData.purposeOther, PURPOSE_OPTIONS),
      purposeKey: formData.purpose as SpeechPurposeKey,
      audience: resolveOptionValue(formData.audience, formData.audienceOther, AUDIENCE_OPTIONS),
      duration: resolveOptionValue(formData.duration, formData.durationOther, DURATION_OPTIONS),
      tone: resolveOptionValue(formData.tone, formData.toneOther, TONE_OPTIONS),
      additionalContext: formData.additionalContext.trim() || undefined,
      readingPassage: formData.purpose === 'reading-exercise' ? formData.readingPassage.trim() || undefined : undefined,
    });
    toast.success('Speech configuration saved!');
  };

  const handleInputChange = (field: keyof FormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="flex h-full flex-col shadow-lg shadow-slate-900/5">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-3">
          <div className="rounded-lg bg-primary p-2 text-white">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Configure Your Speech</h3>
            <p className="mt-0.5 text-sm font-normal text-slate-500">Set parameters for AI-powered analysis</p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-6">
        <form onSubmit={handleSubmit} className="flex h-full flex-col justify-between gap-5">
          <div className="space-y-2">
            <Label htmlFor="topic" className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <Mic className="h-4 w-4 text-secondary" />
              Topic (Optional)
            </Label>
            <Input
              id="topic"
              type="text"
              placeholder="Enter your topic..."
              value={formData.topic}
              onChange={(e) => handleInputChange('topic', e.target.value)}
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Target className="h-4 w-4 text-secondary" />
                Purpose
              </Label>
              <Select value={formData.purpose} onValueChange={(value) => handleInputChange('purpose', value)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select purpose" />
                </SelectTrigger>
                <SelectContent>
                  {PURPOSE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.purpose === 'other' && (
                <Input
                  type="text"
                  placeholder="Describe the purpose..."
                  value={formData.purposeOther}
                  onChange={(e) => handleInputChange('purposeOther', e.target.value)}
              className="h-10"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Users className="h-4 w-4 text-secondary" />
                Target Audience
              </Label>
              <Select value={formData.audience} onValueChange={(value) => handleInputChange('audience', value)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select audience" />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.audience === 'other' && (
                <Input
                  type="text"
                  placeholder="Describe the audience..."
                  value={formData.audienceOther}
                  onChange={(e) => handleInputChange('audienceOther', e.target.value)}
              className="h-10"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Clock className="h-4 w-4 text-secondary" />
                Duration
              </Label>
              <Select value={formData.duration} onValueChange={(value) => handleInputChange('duration', value)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.duration === 'other' && (
                <Input
                  type="text"
                  placeholder="Describe the duration..."
                  value={formData.durationOther}
                  onChange={(e) => handleInputChange('durationOther', e.target.value)}
              className="h-10"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Settings className="h-4 w-4 text-secondary" />
                Desired Tone
              </Label>
              <Select value={formData.tone} onValueChange={(value) => handleInputChange('tone', value)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select tone" />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.tone === 'other' && (
                <Input
                  type="text"
                  placeholder="Describe the tone..."
                  value={formData.toneOther}
                  onChange={(e) => handleInputChange('toneOther', e.target.value)}
              className="h-10"
                />
              )}
            </div>
          </div>

          {formData.purpose === 'reading-exercise' && (
            <div className="space-y-2">
              <Label htmlFor="readingPassage" className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-secondary" />
                Text You'll Read (Optional)
              </Label>
              <Textarea
                id="readingPassage"
                placeholder="Paste the passage you'll read aloud - we'll check for skipped, extra or misread words..."
                value={formData.readingPassage}
                onChange={(e) => handleInputChange('readingPassage', e.target.value)}
                className="min-h-[96px]"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="additionalContext" className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <FileText className="h-4 w-4 text-secondary" />
              Additional Context (Optional)
            </Label>
            <Textarea
              id="additionalContext"
              placeholder="Anything else the AI coach should know before analyzing your speech..."
              value={formData.additionalContext}
              onChange={(e) => handleInputChange('additionalContext', e.target.value)}
              className="min-h-[96px]"
            />
          </div>

          <Button
            type="submit"
            className="h-11 w-full"
          >
            Save Configuration
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default SpeechConfiguration;
