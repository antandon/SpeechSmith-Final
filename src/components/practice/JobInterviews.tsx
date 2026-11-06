import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Users, Briefcase, Upload } from 'lucide-react';
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

interface JobInterviewScenario {
  id: string;
  title: string;
  industry: string;
  level: 'entry' | 'mid' | 'senior';
  duration: string;
  description: string;
  questions: string[];
  tips: string[];
}

const jobInterviewScenarios: JobInterviewScenario[] = [
  {
    id: 'tech-entry',
    title: 'Software Developer - Entry Level',
    industry: 'Technology',
    level: 'entry',
    duration: '15-20 minutes',
    description: 'Practice common entry-level software developer interview questions.',
    questions: [
      'Tell me about yourself and your programming background.',
      'What programming languages are you most comfortable with?',
      'Describe a challenging project you worked on during your studies.',
      'How do you stay updated with new technologies?',
      'Why are you interested in working for our company?'
    ],
    tips: [
      'Show enthusiasm for learning and growth',
      'Demonstrate problem-solving abilities',
      'Mention specific projects or coursework',
      'Research the company beforehand'
    ]
  },
  {
    id: 'self-introduction',
    title: 'Professional Self-Introduction',
    industry: 'General',
    level: 'entry',
    duration: '2-3 minutes',
    description: 'Practice introducing yourself professionally in various settings.',
    questions: [
      'Tell me about yourself.',
      'Walk me through your background.',
      'How would you describe yourself professionally?',
      'What brings you here today?',
      'Give me a brief overview of your experience.'
    ],
    tips: [
      'Keep it concise and relevant',
      'Focus on professional achievements',
      'Connect your background to the opportunity',
      'Practice your elevator pitch'
    ]
  },
  {
    id: 'marketing-mid',
    title: 'Marketing Manager - Mid Level',
    industry: 'Marketing',
    level: 'mid',
    duration: '20-25 minutes',
    description: 'Practice for a marketing manager position with 3-5 years experience.',
    questions: [
      'Walk me through a successful marketing campaign you led.',
      'How do you measure the ROI of marketing initiatives?',
      'Tell me about a time when a campaign didn\'t perform as expected.',
      'How do you stay current with marketing trends and tools?',
      'Describe your experience with digital marketing platforms.'
    ],
    tips: [
      'Prepare specific metrics and results',
      'Show leadership and team management skills',
      'Discuss data-driven decision making',
      'Highlight cross-functional collaboration'
    ]
  },
  {
    id: 'finance-senior',
    title: 'Finance Director - Senior Level',
    industry: 'Finance',
    level: 'senior',
    duration: '30-40 minutes',
    description: 'Executive-level interview for senior finance positions.',
    questions: [
      'Describe your approach to financial planning and analysis.',
      'How have you handled budget constraints in previous roles?',
      'Tell me about a time you identified significant cost savings.',
      'How do you communicate complex financial data to non-finance stakeholders?',
      'What\'s your experience with mergers and acquisitions?'
    ],
    tips: [
      'Demonstrate strategic thinking',
      'Show experience with complex financial decisions',
      'Highlight leadership and team development',
      'Discuss regulatory compliance experience'
    ]
  },
  {
    id: 'sales-entry',
    title: 'Sales Executive - Entry Level',
    industry: 'Sales',
    level: 'entry',
    duration: '15-20 minutes',
    description: 'Practice for entry-level sales positions.',
    questions: [
      'What attracts you to a career in sales?',
      'How would you handle rejection from potential clients?',
      'Describe a time when you persuaded someone to change their mind.',
      'What do you know about our products/services?',
      'How do you stay motivated when targets are challenging?'
    ],
    tips: [
      'Show resilience and persistence',
      'Demonstrate communication skills',
      'Express genuine interest in helping customers',
      'Highlight competitive nature and goal orientation'
    ]
  },
  {
    id: 'hr-mid',
    title: 'HR Recruiter - Mid Level',
    industry: 'Human Resources',
    level: 'mid',
    duration: '25-30 minutes',
    description: 'Practice for mid-level HR business partner roles.',
    questions: [
      'How do you handle employee conflicts?',
      'Describe your experience with performance management.',
      'Tell me about a time you had to deliver difficult news to an employee.',
      'How do you ensure compliance with employment laws?',
      'What\'s your approach to employee engagement and retention?'
    ],
    tips: [
      'Show empathy and emotional intelligence',
      'Demonstrate knowledge of HR policies',
      'Highlight conflict resolution skills',
      'Discuss data-driven HR initiatives'
    ]
  },
  {
    id: 'consulting-senior',
    title: 'Senior Consultant - Management Consulting',
    industry: 'Consulting',
    level: 'senior',
    duration: '30-35 minutes',
    description: 'Practice for senior consulting positions.',
    questions: [
      'Walk me through how you would approach a new client engagement.',
      'Describe a time when you had to present recommendations to C-level executives.',
      'How do you handle situations where clients resist your recommendations?',
      'Tell me about your experience managing junior consultants.',
      'What methodologies do you use for problem-solving?'
    ],
    tips: [
      'Demonstrate structured thinking',
      'Show client management experience',
      'Highlight analytical and presentation skills',
      'Discuss team leadership and mentoring'
    ]
  },
  {
    id: 'customer-support-entry',
    title: 'Customer Support Executive - Entry Level',
    industry: 'Customer Support',
    level: 'entry',
    duration: '15-20 minutes',
    description: 'Practice common interview questions for customer support and service roles.',
    questions: [
      'Tell me about a time you dealt with an angry or frustrated customer.',
      'How do you handle a situation where you don\'t know the answer to a customer\'s question?',
      'What does great customer service mean to you?',
      'How do you prioritize when handling multiple customer requests at once?',
      'Describe a time you turned a negative customer experience into a positive one.'
    ],
    tips: [
      'Show patience and active listening',
      'Demonstrate calm, empathetic communication under pressure',
      'Give specific examples of resolving issues, not just describing them',
      'Highlight comfort with support tools and following escalation processes'
    ]
  },
  {
    id: 'paramedical-entry',
    title: 'Paramedical Services - Entry Level',
    industry: 'Healthcare',
    level: 'entry',
    duration: '15-20 minutes',
    description: 'Practice for entry-level paramedical and allied healthcare support roles.',
    questions: [
      'Why did you choose a career in paramedical services?',
      'How do you stay calm and effective in a medical emergency?',
      'Describe a time you had to follow strict protocols under pressure.',
      'How do you communicate with anxious patients or their families?',
      'What steps do you take to maintain hygiene and safety standards on the job?'
    ],
    tips: [
      'Emphasize composure and clear decision-making under pressure',
      'Show empathy for patients while staying professional',
      'Reference specific protocols, certifications, or training',
      'Demonstrate attention to safety and accuracy'
    ]
  },
  {
    id: 'air-hostess-entry',
    title: 'Air Hostess / Cabin Crew - Entry Level',
    industry: 'Aviation',
    level: 'entry',
    duration: '15-20 minutes',
    description: 'Practice for cabin crew and airline customer service interviews.',
    questions: [
      'Why do you want to work as cabin crew?',
      'How would you handle a passenger who refuses to follow safety instructions?',
      'Describe a time you had to stay pleasant and professional during a stressful situation.',
      'How would you assist a passenger with a medical issue mid-flight?',
      'What does excellent in-flight service look like to you?'
    ],
    tips: [
      'Project warmth, poise, and confident body language in your delivery',
      'Show calm authority when describing safety-related situations',
      'Emphasize teamwork with fellow crew members',
      'Keep answers polished, positive, and guest-focused'
    ]
  },
  {
    id: 'front-office-entry',
    title: 'Front Office Executive - Entry Level',
    industry: 'Hospitality/Administration',
    level: 'entry',
    duration: '15-20 minutes',
    description: 'Practice for front desk, reception, and front office executive roles.',
    questions: [
      'How would you greet and assist a visitor who doesn\'t have an appointment?',
      'Describe a time you managed multiple phone calls or visitors at once.',
      'How do you handle a guest or visitor complaint at the front desk?',
      'What systems or software have you used for scheduling or check-in?',
      'How do you maintain a professional appearance and demeanor throughout a long shift?'
    ],
    tips: [
      'Highlight organization and multitasking skills',
      'Show a friendly, professional first impression in your tone',
      'Give concrete examples of handling front-desk situations',
      'Mention any relevant software or booking systems experience'
    ]
  },
  {
    id: 'technician-entry',
    title: 'Electrical/Mechanical/Civil Technician - Entry Level',
    industry: 'Technical/Engineering',
    level: 'entry',
    duration: '15-20 minutes',
    description: 'Practice for entry-level electrical, mechanical, or civil technician roles.',
    questions: [
      'Walk me through how you would diagnose a fault in a system you\'re unfamiliar with.',
      'Describe a hands-on project or repair you\'re proud of.',
      'How do you ensure you follow safety procedures on site?',
      'How do you handle it when a job takes longer than expected?',
      'What tools or equipment are you most comfortable working with?'
    ],
    tips: [
      'Be specific about tools, standards, and procedures you\'ve used',
      'Emphasize safety-first thinking',
      'Explain technical steps in a clear, easy-to-follow order',
      'Show willingness to learn new equipment or systems'
    ]
  }
];

// Tips for each question, keyed by its exact text. The scenario's general
// tips are only a fallback for a question that isn't listed here.
const QUESTION_TIPS: Record<string, string[]> = {
  // Software Developer - Entry Level
  'Tell me about yourself and your programming background.': [
    'Use present, past, future: what you do now, how you got into coding, what you want next',
    'Name 1-2 languages and one project you built, not a list of every technology',
    'Keep it under 90 seconds and end on why this role fits',
  ],
  'What programming languages are you most comfortable with?': [
    'Pick one or two and say what you built with each',
    'Be honest about your level - "comfortable" and "learning" are both fine answers',
    'Mention how quickly you picked up a new language when a project needed it',
  ],
  'Describe a challenging project you worked on during your studies.': [
    'Use STAR: Situation, Task, Action, Result',
    'Spend most of the time on what you did, not on what the team did',
    'Finish with a result or a lesson you still use',
  ],
  'How do you stay updated with new technologies?': [
    'Name real sources: specific blogs, newsletters, courses or communities',
    'Give one recent thing you learned and tried out',
    'Show you filter hype - you learn what is useful for your work',
  ],
  'Why are you interested in working for our company?': [
    'Mention something specific: their product, tech stack or a recent launch',
    'Link it to what you want to learn or build',
    'Avoid answers that only talk about salary or location',
  ],

  // Professional Self-Introduction
  'Tell me about yourself.': [
    'Start with who you are professionally, not your childhood or hometown',
    'Pick 2-3 highlights that matter for this opportunity',
    'Close with what you are looking for next',
  ],
  'Walk me through your background.': [
    'Go in order, and spend more time on recent roles than old ones',
    'Explain each move in one line - why you made it',
    'Connect the path to where you are now',
  ],
  'How would you describe yourself professionally?': [
    'Choose three qualities and back each with a quick example',
    'Avoid empty words like "hard-working" without proof',
    'Keep the tone confident, not boastful',
  ],
  'What brings you here today?': [
    'State your goal plainly in the first sentence',
    'Explain what drew you to this opportunity specifically',
    'Keep it positive - do not criticise a past job',
  ],
  'Give me a brief overview of your experience.': [
    'Aim for 60-90 seconds; brief means brief',
    'Group experience into themes instead of listing every job',
    'Include one number - years, team size or a result',
  ],

  // Marketing Manager - Mid Level
  'Walk me through a successful marketing campaign you led.': [
    'State the goal, audience and channel before the details',
    'Make your own role and decisions clear',
    'End with numbers: reach, conversions, revenue or ROI',
  ],
  'How do you measure the ROI of marketing initiatives?': [
    'Name the metrics you track, such as CAC, LTV, ROAS and conversion rate',
    'Mention the tools you use for attribution',
    'Give one example where the data changed your plan',
  ],
  'Tell me about a time when a campaign didn\'t perform as expected.': [
    'Own the result - do not blame the team or the budget',
    'Explain how you found out what went wrong',
    'Spend most of the answer on what you changed and learned',
  ],
  'How do you stay current with marketing trends and tools?': [
    'Name specific sources, communities or courses',
    'Give a recent trend you tested and how it went',
    'Show you judge trends by results, not novelty',
  ],
  'Describe your experience with digital marketing platforms.': [
    'Name platforms you have hands-on experience with (e.g. Google Ads, Meta, HubSpot)',
    'Pair each with a task or result, not just the name',
    'Mention budget or audience size you managed',
  ],

  // Finance Director - Senior Level
  'Describe your approach to financial planning and analysis.': [
    'Outline your process: forecasting, budgeting, variance review',
    'Mention how you involve business leaders in the plan',
    'Give one decision your analysis shaped',
  ],
  'How have you handled budget constraints in previous roles?': [
    'Use a real example with the size of the gap',
    'Explain how you prioritised and who you consulted',
    'Show the outcome - what was protected and what was cut',
  ],
  'Tell me about a time you identified significant cost savings.': [
    'Quantify the saving in money or percentage',
    'Explain how you spotted it - the analysis behind it',
    'Mention how you got buy-in to make the change',
  ],
  'How do you communicate complex financial data to non-finance stakeholders?': [
    'Lead with the decision or the "so what", not the numbers',
    'Mention simple visuals and plain language',
    'Give an example of a stakeholder who acted on your explanation',
  ],
  'What\'s your experience with mergers and acquisitions?': [
    'Be specific about your role: due diligence, valuation or integration',
    'Mention deal size or complexity if you can share it',
    'If experience is limited, say so and describe related work',
  ],

  // Sales Executive - Entry Level
  'What attracts you to a career in sales?': [
    'Give a genuine reason - helping people decide, targets, or growth',
    'Back it with a moment where you enjoyed persuading or helping someone',
    'Sound energetic - tone matters as much as words here',
  ],
  'How would you handle rejection from potential clients?': [
    'Show you do not take it personally',
    'Explain how you learn from a "no" and when you follow up',
    'Mention how you keep your energy up for the next call',
  ],
  'Describe a time when you persuaded someone to change their mind.': [
    'Use STAR and keep the situation short',
    'Show you listened to their concerns before persuading',
    'End with the outcome and how the relationship stayed positive',
  ],
  'What do you know about our products/services?': [
    'Mention one or two products by name',
    'Say who their customers are and what problem they solve',
    'Add how you would pitch it - this shows real preparation',
  ],
  'How do you stay motivated when targets are challenging?': [
    'Break it into daily goals and habits',
    'Give an example of a tough target you worked towards',
    'Show resilience without sounding unrealistic',
  ],

  // HR Recruiter - Mid Level
  'How do you handle employee conflicts?': [
    'Describe your steps: listen to both sides, find facts, agree next steps',
    'Stress neutrality and confidentiality',
    'Give a short real example with the outcome',
  ],
  'Describe your experience with performance management.': [
    'Mention the process you ran: goals, reviews, improvement plans',
    'Show how you supported managers, not just filled forms',
    'Include a result - better ratings, retention or fewer disputes',
  ],
  'Tell me about a time you had to deliver difficult news to an employee.': [
    'Show preparation: facts, timing and a private setting',
    'Describe how you stayed clear but kind',
    'Mention how you supported the person afterwards',
  ],
  'How do you ensure compliance with employment laws?': [
    'Name the areas you track: contracts, leave, wages, workplace safety',
    'Mention audits, training or legal updates you follow',
    'Give one example where you fixed a compliance gap',
  ],
  'What\'s your approach to employee engagement and retention?': [
    'Mention how you measure engagement - surveys, exit interviews, attrition',
    'Give one initiative you ran and its effect',
    'Connect engagement to business results',
  ],

  // Senior Consultant - Management Consulting
  'Walk me through how you would approach a new client engagement.': [
    'Give a clear structure: understand, diagnose, recommend, implement',
    'Mention how you agree scope and success measures with the client',
    'Keep it structured - signpost "first, second, third"',
  ],
  'Describe a time when you had to present recommendations to C-level executives.': [
    'Lead with how you framed the answer first, then the support',
    'Mention how you handled tough questions',
    'End with the decision they made',
  ],
  'How do you handle situations where clients resist your recommendations?': [
    'Show you listen to understand the resistance first',
    'Explain how you used data or a pilot to build trust',
    'Give an example and its outcome',
  ],
  'Tell me about your experience managing junior consultants.': [
    'Mention team size and how you delegated',
    'Describe how you coached and gave feedback',
    'Share a team member\'s growth as the result',
  ],
  'What methodologies do you use for problem-solving?': [
    'Name frameworks you actually use: issue trees, hypothesis-driven, MECE',
    'Show how you applied one to a real problem',
    'Say when you adapt rather than follow a framework rigidly',
  ],

  // Customer Support Executive - Entry Level
  'Tell me about a time you dealt with an angry or frustrated customer.': [
    'Use STAR and describe how you stayed calm',
    'Show you listened and acknowledged their frustration',
    'End with the resolution and how the customer felt',
  ],
  'How do you handle a situation where you don\'t know the answer to a customer\'s question?': [
    'Say you would be honest rather than guess',
    'Explain how you find the answer - knowledge base, team, escalation',
    'Mention following up within a promised time',
  ],
  'What does great customer service mean to you?': [
    'Give a clear one-line definition first',
    'Back it with an example you gave or received',
    'Mention speed, empathy and getting it right the first time',
  ],
  'How do you prioritize when handling multiple customer requests at once?': [
    'Explain how you judge urgency and impact',
    'Mention tools like ticket queues or tags',
    'Show you keep customers informed while they wait',
  ],
  'Describe a time you turned a negative customer experience into a positive one.': [
    'Briefly set up what went wrong',
    'Focus on the specific actions you took',
    'End with proof - thanks, a review or a returning customer',
  ],

  // Paramedical Services - Entry Level
  'Why did you choose a career in paramedical services?': [
    'Share a genuine reason or moment that led you here',
    'Connect it to caring for patients',
    'Mention the training or certification you completed',
  ],
  'How do you stay calm and effective in a medical emergency?': [
    'Describe your method: assess, prioritise, follow protocol',
    'Give a real or training example',
    'Show you communicate clearly with the team during it',
  ],
  'Describe a time you had to follow strict protocols under pressure.': [
    'Name the protocol and the situation briefly',
    'Explain why following it mattered',
    'End with the outcome for the patient or the team',
  ],
  'How do you communicate with anxious patients or their families?': [
    'Mention a calm tone, simple words and eye contact',
    'Show you listen and answer their questions honestly',
    'Give a short example of reassuring someone',
  ],
  'What steps do you take to maintain hygiene and safety standards on the job?': [
    'List specific steps: hand hygiene, PPE, sterilisation, waste disposal',
    'Mention any standards or checklists you follow',
    'Show you speak up if you see a lapse',
  ],

  // Air Hostess / Cabin Crew - Entry Level
  'Why do you want to work as cabin crew?': [
    'Give a reason beyond travel - service, people, safety',
    'Link it to experience in customer-facing roles',
    'Smile in your voice - warmth is part of the answer',
  ],
  'How would you handle a passenger who refuses to follow safety instructions?': [
    'Show calm but firm authority',
    'Explain the steps: polite reminder, explain why, escalate to the senior crew',
    'Stress that safety is non-negotiable',
  ],
  'Describe a time you had to stay pleasant and professional during a stressful situation.': [
    'Use STAR and keep the situation brief',
    'Describe how you controlled your tone and body language',
    'End with how the situation was resolved',
  ],
  'How would you assist a passenger with a medical issue mid-flight?': [
    'Describe the steps: assess, inform the senior crew, use first aid training',
    'Mention asking for a medical professional on board',
    'Show you keep the passenger and those around them calm',
  ],
  'What does excellent in-flight service look like to you?': [
    'Mention anticipating needs before passengers ask',
    'Balance warmth with safety and efficiency',
    'Give a small example of great service you have given or seen',
  ],

  // Front Office Executive - Entry Level
  'How would you greet and assist a visitor who doesn\'t have an appointment?': [
    'Start with a warm greeting and ask how you can help',
    'Explain how you check availability or offer an alternative',
    'Show you follow security and visitor-log rules',
  ],
  'Describe a time you managed multiple phone calls or visitors at once.': [
    'Explain how you prioritised and who you asked to wait',
    'Show you stayed polite with everyone',
    'End with how it worked out',
  ],
  'How do you handle a guest or visitor complaint at the front desk?': [
    'Listen fully, apologise and avoid arguing',
    'Explain how you solve it or pass it to the right person',
    'Mention following up so the guest leaves satisfied',
  ],
  'What systems or software have you used for scheduling or check-in?': [
    'Name the systems you have used',
    'Say what you used them for - bookings, check-in, billing',
    'If you are new to them, show how quickly you learn software',
  ],
  'How do you maintain a professional appearance and demeanor throughout a long shift?': [
    'Mention preparation: grooming, rest and breaks',
    'Show you keep the same friendly tone in hour ten as in hour one',
    'Give a quick example of a long or busy day',
  ],

  // Electrical/Mechanical/Civil Technician - Entry Level
  'Walk me through how you would diagnose a fault in a system you\'re unfamiliar with.': [
    'Go step by step: safety first, check drawings or manuals, test, isolate',
    'Mention the tools you would use',
    'Say when you would ask a senior for help',
  ],
  'Describe a hands-on project or repair you\'re proud of.': [
    'Describe the problem and the tools or methods you used',
    'Be specific about what you did with your own hands',
    'End with the result and what you learned',
  ],
  'How do you ensure you follow safety procedures on site?': [
    'Name specific practices: PPE, lockout/tagout, permits, toolbox talks',
    'Show you stop work if something is unsafe',
    'Give an example where safety rules prevented a problem',
  ],
  'How do you handle it when a job takes longer than expected?': [
    'Explain how you tell your supervisor early',
    'Show you find the cause rather than rush and cut corners',
    'Give an example and the outcome',
  ],
  'What tools or equipment are you most comfortable working with?': [
    'Name specific tools or machines and what you used them for',
    'Mention any certifications or training',
    'Show you are open to learning new equipment',
  ],
};

interface JobInterviewsProps {
  onBack?: () => void;
}

const JobInterviews: React.FC<JobInterviewsProps> = ({ onBack }) => {
  const [selectedScenario, setSelectedScenario] = useState<JobInterviewScenario | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { speechConfig, setSpeechConfig, setSpeechData, setHasRecorded, setSavedAnalysisId, beginNewRequest, isCurrentRequest } = useSpeech();
  const { user } = useAuth();
  const { incrementUsage, isTrialExpired, getRemainingTries } = useTrialMode();
  useClearPracticeConfigOnLeave();

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'entry': return 'bg-green-100 text-green-800';
      case 'mid': return 'bg-yellow-100 text-yellow-800';
      case 'senior': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Sample professional introduction for Anoushka Tandon
  const sampleIntroduction = `Hello, I'm Anoushka Tandon, a dedicated student passionate about innovation and academic excellence. I have been recognized twice with CREST awards for my outstanding research projects in science and technology. My academic journey has been enriched by hands-on experience in research methodology and data analysis. I'm particularly interested in applying technology to solve real-world problems and have developed strong analytical and communication skills through my academic projects. I'm excited about opportunities that challenge me to grow and contribute meaningfully to dynamic teams.`;

  // Content feedback is judged against this exact question, not the scenario
  // in general.
  const questionConfig = (scenario: JobInterviewScenario, questionIndex: number): SpeechConfig => ({
    topic: scenario.title,
    purpose: `${scenario.level} level ${scenario.industry} interview`,
    purposeKey: 'job-interview',
    audience: 'Interview panel',
    duration: scenario.duration,
    tone: 'professional and confident',
    practicePrompt: scenario.questions[questionIndex],
  });

  // Clear any leftover result from a previous mode/scenario/question so it
  // can't show under this one, and invalidate any analysis still in flight so
  // it can't land here later either.
  const clearResult = () => {
    setSpeechData(null);
    setHasRecorded(false);
    setSavedAnalysisId(null);
    beginNewRequest();
  };

  // Ready to record as soon as a question is on screen - no extra "start" click.
  useEffect(() => {
    if (!selectedScenario) return;
    setSpeechConfig(questionConfig(selectedScenario, currentQuestionIndex));
    clearResult();
  }, [selectedScenario, currentQuestionIndex]);

  const goToQuestion = (index: number) => setCurrentQuestionIndex(index);

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
      
      const analysisMessage = selectedScenario 
        ? `Analyzing your interview answer with AI...`
        : 'Analyzing your speech with AI...';
      
      toast.info(analysisMessage, { duration: 2000 });
      
      setSavedAnalysisId(null);
      const myRequestId = beginNewRequest();
      // The question on screen when recording finished.
      const analysis = await analyzeWithSelectedProvider(audioBlob, '', 'openai',
        selectedScenario ? questionConfig(selectedScenario, currentQuestionIndex) : speechConfig);

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
        const title = selectedScenario 
          ? `${selectedScenario.title} - ${new Date().toLocaleDateString()}`
          : `Job Interview - ${new Date().toLocaleDateString()}`;
          
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

      toast.success('Analysis complete! Your interview answer has been analyzed with personalized coaching feedback.');
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
      
      // Convert file to Blob and process
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
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (selectedScenario) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button 
            variant="outline" 
            onClick={() => {
              setSelectedScenario(null);
              setCurrentQuestionIndex(0);
            }}
          >
            ← Back to Scenarios
          </Button>
          <Badge className={getLevelColor(selectedScenario.level)}>
            {selectedScenario.level.toUpperCase()} LEVEL
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              {selectedScenario.title}
            </CardTitle>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {selectedScenario.industry}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {selectedScenario.duration}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-6">{selectedScenario.description}</p>

            {/* Sample Introduction for Self-Introduction scenario */}
            {selectedScenario.id === 'self-introduction' && (
              <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-900 mb-2">Sample Professional Introduction:</h4>
                <p className="text-green-800 text-sm italic">"{sampleIntroduction}"</p>
              </div>
            )}


            {/* Current Question */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">Question {currentQuestionIndex + 1} of {selectedScenario.questions.length}</h4>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToQuestion(Math.max(0, currentQuestionIndex - 1))}
                    disabled={currentQuestionIndex === 0 || isRecording || isAnalyzing}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToQuestion(Math.min(selectedScenario.questions.length - 1, currentQuestionIndex + 1))}
                    disabled={currentQuestionIndex === selectedScenario.questions.length - 1 || isRecording || isAnalyzing}
                  >
                    Next
                  </Button>
                </div>
              </div>

              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <p className="text-lg font-medium text-gray-900">
                    <span className="mr-2 font-bold text-secondary">Q.</span>
                    {selectedScenario.questions[currentQuestionIndex]}
                  </p>
                </CardContent>
              </Card>

              <div className="mt-4 p-4 bg-accent/50 rounded-lg">
                <h4 className="font-semibold text-stone-900 mb-2">Tips for this question:</h4>
                <ul className="list-disc list-inside space-y-1 text-stone-900">
                  {(QUESTION_TIPS[selectedScenario.questions[currentQuestionIndex]] ?? selectedScenario.tips).map((tip, index) => (
                    <li key={index} className="text-sm">{tip}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Recording Section */}
              <div className="space-y-6">
                <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-gray-50">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Briefcase className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">Record Your Answer</h3>
                          <p className="text-sm text-gray-600 mt-1">AI analysis for interview response</p>
                        </div>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <AudioRecorder 
                      onRecordingComplete={handleRecordingComplete}
                      isAnalyzing={isAnalyzing}
                      onRecordingChange={setIsRecording}
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
                    
                    {isAnalyzing && (
                      <div className="text-center bg-accent/50 px-6 py-3 rounded-xl border border-secondary/20">
                        <div className="flex items-center justify-center space-x-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-secondary"></div>
                          <p className="text-stone-700 font-medium">
                            Analyzing your interview answer with AI...
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

            <div className="mt-6">
              <PracticeReport prompt={selectedScenario.questions[currentQuestionIndex]} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-2xl font-bold mb-2">Job Interview Practice</h3>
        <p className="text-gray-600">
          Practice common interview questions for different industries and experience levels.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jobInterviewScenarios.map((scenario) => (
          <Card key={scenario.id} className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg">{scenario.title}</CardTitle>
                <Badge className={getLevelColor(scenario.level)}>
                  {scenario.level.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {scenario.industry}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {scenario.duration}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 mb-4">{scenario.description}</p>
              <p className="text-sm text-gray-600 mb-4">
                {scenario.questions.length} practice questions
              </p>
              <Button 
                onClick={() => setSelectedScenario(scenario)}
                className="w-full"
              >
                Start Practice
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default JobInterviews;
