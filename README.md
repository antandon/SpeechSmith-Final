# SpeechSmith

A speech-practice web app for public speaking, interviews, storytelling, and debate. Record yourself, get AI-powered transcription and feedback, and track your progress over time.

## Features

- **Guided practice modes**: public speaking, job interviews (9+ sectors), storytelling, creative storytelling, descriptive narration, debate topics
- **Audio recording & transcription** via Deepgram and OpenAI Whisper
- **AI feedback** on delivery, filler words, mood/tone, and pronunciation (OpenAI / Gemini)
- **Real pace & pause metrics** computed from Whisper's word-level timestamps — words-per-minute, pause locations/durations, and pace broken down by section
- **Rewritten-speech markup**: the AI's improved version of your speech is rendered with visible pauses, emphasis, slow-down cues, and highlighted vocabulary/pronunciation fixes
- **Text-to-speech playback** of the improved version of your speech, via Deepgram and ElevenLabs
- **Feedback ratings**: thumbs up/down (with optional comment) on each AI report, logged so the coaching prompts can be reviewed and tuned over time
- **Practice history & analytics**, including a filler-word cloud and speech analytics dashboard
- **Authentication & data storage** via Supabase
- **Trial mode** for unauthenticated users, with limited free tries before requiring sign-up
- **Mobile companion** via QR code

## How it works

1. Sign up / log in (Supabase Auth).
2. Configure your speech (purpose, audience, tone, duration) and pick a practice mode.
3. Record yourself speaking directly in the browser.
4. Your recording is sent to a Supabase Edge Function, which transcribes it with word-level timestamps (Whisper, falling back to Gemini) and runs a detailed analysis: filler words, pronunciation, real pace/pausing derived from those timestamps, tone, and an AI-rewritten "improved" version of your speech with markup for pauses, emphasis, and highlights.
5. The improved version is converted to speech via Deepgram TTS so you can hear how it should sound.
6. Results are saved to your account and shown on your analytics dashboard, so you can track progress across sessions — and you can rate each report (helpful / not helpful) to help improve future feedback.

## Tech stack

- **Frontend**: Vite, TypeScript, React, React Router, shadcn/ui (Radix), Tailwind CSS, Recharts
- **Backend**: Supabase (Auth, Postgres with Row Level Security, Edge Functions)
- **AI services**: OpenAI (Whisper transcription, GPT analysis), Gemini (transcription/analysis fallback), Deepgram (transcription & TTS), ElevenLabs (TTS)

## Getting started

Requires Node.js & npm ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
npm i
npm run dev
```

Pronunciation is scored by Azure Speech when the `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` Edge Function secrets are set (Dashboard → Edge Functions → Secrets); otherwise GPT estimates it.
