# SpeechSmith end-to-end test plan

You are testing SpeechSmith end to end: the speech-analysis edge function, the report it produces, and the web app that records, shows, saves and reopens reports. Work through every section below, record the result of every test case, then fix the defects you're confident about.

## Ground rules

- Don't commit, push or deploy anything. Don't run `supabase functions deploy`.
- Never print API keys or the contents of any `.env` file. Refer to variables by name only.
- Each analysis call costs money (Whisper, GPT, Azure, TTS). Keep the full run to about 35 analysis calls. Don't loop or retry blindly.
- Test against the local code, not speechsmith.net. The latest fixes are not deployed yet.
- Put every helper file you create (audio, scripts, outputs) in `e2e/` at the repo root, and leave it uncommitted.
- American English (en-US) only. There's no accent choice in the UI; scoring and all playback are en-US.

## 0. Setup

1. Run the fast checks first. All of them must pass before you go further. `tsc` has exactly 2 known errors in `src/pages/About.tsx` (Embla types); anything else is a failure.
   ```bash
   node supabase/functions/analyze-speech-openai/azure.test.ts
   deno test --allow-env supabase/functions/analyze-speech-openai/limits.test.ts
   deno check supabase/functions/analyze-speech-openai/index.ts supabase/functions/openai-tts/index.ts
   npx tsc --noEmit -p tsconfig.app.json
   npx vite build
   ```
2. Start the analysis function locally (it listens on port 8000). Something may already be listening on 8000: check with `lsof -nP -iTCP:8000 -sTCP:LISTEN` and `ps -o lstart,command -p <pid>`. If that process started before the last edit to `index.ts`, it's serving stale code: kill it and start a fresh one. Always use `--watch`, so later fixes are picked up without a restart. A stale server once made every local test in this project lie.

   Setting `SUPABASE_URL` to empty is meant to switch off the daily usage limits. Read `limits.ts` to confirm an empty value really skips them. Also confirm that a value already set in the environment is not overwritten by `--env-file`.
   ```bash
   SUPABASE_URL= deno run --watch --allow-net --allow-env --allow-read --env-file=supabase/functions/.env supabase/functions/analyze-speech-openai/index.ts
   ```
   Check by name only, without printing values, that `OPENAI_API_KEY`, `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are set. If the Azure keys are missing, say so, because the pronunciation tests then fall back to GPT estimates.
3. Make the web app use the local function. `.env.local` should set `VITE_ANALYZE_FUNCTION_URL=http://localhost:8000`. Check the variable name only, and tell me if it points somewhere else. Then run `npm run dev` (port 8080), or reuse a dev server that's already running. Vite reads `.env.local` only at startup, so restart it if you change that file.
4. Generate the test audio with macOS `say` and `afconvert`. `say -r` sets words per minute, and `[[slnc 3000]]` inserts 3 s of silence.
   ```bash
   say -v Samantha -r 150 -o e2e/a.aiff "text..."
   afconvert e2e/a.aiff e2e/a.m4a -f m4af -d aac                # upload format
   afconvert e2e/a.aiff e2e/a.wav -f WAVE -d LEI16@16000 -c 1   # 16 kHz mono for Azure
   ```
   Voice: Samantha (en-US).
5. Write one small runner, `e2e/run.py` (or `.ts`), that does the following for each case:
   1. POSTs this JSON to `http://localhost:8000`:
      ```
      {
        audioBase64,
        mimeType,
        speechConfig: { purpose, purposeKey, audience, tone, topic, readingPassage?, practicePrompt? },
        loudness: { frameSeconds: 0.05, rms: [...] },
        pcm16kBase64
      }
      ```
      - `audioBase64` is the m4a file, base64-encoded.
      - `pcm16kBase64` is the raw 16-bit samples of the 16 kHz WAV, base64-encoded. Read them with Python's `wave` module; don't assume a 44-byte header.
      - `loudness.rms` is the RMS of each 50 ms frame (800 samples at 16 kHz) of the samples scaled to -1..1, rounded to 4 decimals. The browser sends this too (see `decodeForAnalysis` in `src/utils/speechAnalysisUtils.ts`; match it). The server uses it for volume highlights and to reject transcripts Whisper invents from silence, so leaving it out skips both.
   2. Saves each response to `e2e/out/<case>.json`.
   3. Runs the invariant checks in section 1 on every 200 response, plus the case-specific checks in section 2.

## 1. Invariants: check on every successful response

| # | Check |
|---|---|
| I1 | No string anywhere in the JSON contains `undefined`, `NaN` or `[object Object]`. |
| I2 | `overallScore` and every `feedback[].score` and `analytics.categoryScores[].value` are integers from 0 to 100. |
| I3 | `overallScore` lies between the lowest and highest of the feedback scores plus the Structure category score, when Structure exists. |
| I4 | `feedback[].color` matches its score: 80 or more is green, 60-79 yellow, below 60 red. Emotional Delivery is the only exception: it may be yellow at 80+ when `toneAnalysis.measured.monotone` is true. |
| I5 | `feedback` has 5 rows, and each has a string `category`, a numeric `score` and non-empty `feedback` text. |
| I6 | Every grammar issue `original`, vocabulary weakness `word`, tone-suggestion `original`, non-empty content `excerpt` and emphasis `phrase` appears in `transcription`, ignoring case and punctuation. |
| I7 | `improvedTranscriptionClean` contains no markup: no `\|`, `**`, `[[` or `]]`. |
| I8 | `speechMetrics.fillerWordPercentage` equals `round(filler mistakes / totalWords * 100)`. |
| I9 | The Filler Words feedback text quotes the same filler count as `mistakes` with `type: "filler"`. |
| I10 | The Speaking Pace feedback text quotes the same WPM as `speechMetrics.wordsPerMinute`. The score is 100 when WPM is 120-160 and drops 1 per WPM outside that range, with a floor of 20. |
| I11 | `speechConfig` is echoed back. `speechConfig.accent` is always en-US, whatever was sent. |
| I12 | `speechMetrics.measured` is true when Whisper returned word timings. |
| I13 | Every `mispronuncedWords[].occurrence`, when present, is an integer below the number of times that word appears in the transcript. |
| I14 | `improvedAudioUrl` is a `data:audio/mpeg;base64,...` URL. Note it if missing. |
| I15 | Grammar feedback text says "N grammar mistakes", and N equals the number of `grammarAnalysis.issues` with `kind: "error"`. |
| I16 | No grammar issue, vocabulary weakness or grammar tip is about spelling, typos, punctuation or capitalization. Nobody can hear those in speech; a "misspelled" word means the transcriber misheard. |
| I17 | Grammar is judged as spoken English. No grammar issue or tip is about run-ons, fragments, repeated words, fillers or pauses. An issue that only adds an optional article or a list item's implied "I will" has `kind: "refinement"`, never `"error"`. |
| I18 | Courtesy phrases ("Thank you", "Hi everyone", "Good morning") are never flagged by grammar, vocabulary or content. |
| I19 | `contentQualityAnalysis.contextAlignment.status` agrees with its own summary. If the summary says the speech is off topic, the status is "off-topic". If it says the speaker didn't answer or lacks something the prompt asked for, the status is not "aligned". |
| I20 | Filler mistakes for "um", "uh", "er", "ah" or "hmm" have an empty `alternatives` list, and their suggestion says to pause silently. No filler alternative is a formal connector such as "Consequently", "Thus" or "Furthermore". |
| I21 | A `pace` mistake saying "Rushed" covers at least 3 s or 12 words, and its quoted WPM is above 190. A steady speech near the overall WPM has none. |
| I22 | Every `sectionPace` value is above 0, and the values sit on both sides of `speechMetrics.wordsPerMinute` or close to it. Either all 3 sections are present or none are. |

## 2. API test cases

Run each case and record pass or fail against every invariant and the "Expect" column. Keep each recording 20-60 s unless the case says otherwise.

| ID | Input | Expect |
|---|---|---|
| A1 | Clear on-topic presentation, Samantha, `-r 150`, en-US, topic "remote work" | All invariants pass. Pace score is 100. `toneAnalysis.measured` is present (with Azure). Also compute the true rate yourself: the transcript's word count divided by the speaking time, measured from the audio (first to last sample above the noise floor). `speechMetrics.wordsPerMinute` must be within 15% of it. A larger gap is an app bug in `computeMetricsFromWords`, even if the score looks plausible. A quick run of `-r 190` audio once reported 274 WPM, so check this carefully. |
| A2 | Same text at `-r 230` | WPM over 160, pace score under 100, and the pace text says "faster". `mistakes` may include `type: "pace"`. |
| A3 | Same text at `-r 90` | WPM under 120, and the pace text says "slower". |
| A4 | Speech containing "um", "uh" and "you know, it was" (with the comma) | These are counted as fillers. Filler score is `max(20, round(100 - 7 * filler%))`. If Whisper drops the fillers, note that; it's not an app bug. |
| A5 | Speech containing "Do you know what time it is", "as you know" and "you know that this matters" | None of these "you know" uses is flagged as a filler. |
| A6 | Speech containing "I I think we we can" and "I went to the shop too" | The "I I" and "we we" repetitions are flagged as `type: "repetition"` delivery mistakes, and each is counted only once. Neither appears in `grammarAnalysis.issues`. "to … too" is not flagged. |
| A7 | Silence only: `say "[[slnc 6000]]"` | `overallScore` is 0, WPM is 0 and every feedback score is 0 with the "Not enough speech" note. Tone fields are "not assessed". There are no suggestions, mispronounced words or grammar issues. |
| A8 | Two words: "Hello there" | Same as A7. |
| A8b | 5 s of low hiss only (random noise at about 0.003 amplitude) with its real `loudness` | Same as A7. If Whisper returns any text for it, the response must still be the A7 "not enough speech" result. |
| A8c | A1's speech audio, but with `loudness.rms` replaced by 0.001 in every frame. This simulates Whisper inventing words over a silent recording, which can't be triggered on demand. | Same as A7: the loudness check rejects words the audio doesn't support. Then send A1 with its real loudness and confirm it is analysed normally, so the check doesn't reject real speech. |
| A8d | A1 spoken quietly: scale the samples to 15% before encoding, with matching `loudness` | Analysed normally, not rejected as silence. A soft-spoken user must never be told they said nothing. |
| A8e | The first 3 s of A1 (about 8 words), and a 1 s clip ("Good morning, everyone") | Same as A7 (fewer than 10 words): the card says "Your answer was too short to score", "What we heard" shows the words, and there are no scores. A one-sentence answer of 10+ words (e.g. "I am X, I am pursuing my bachelor's in computer applications") must get a full report. Never a report that says "too brief to assess pace" next to a pace score. |
| A8f | Unintelligible audio: A1 or pasta, low-passed hard and turned down (muffled), or buried in noise at -10 dB SNR | Same as A7, with an empty transcript. The log shows `🎯 Whisper mean logprob` below -1 and "Whisper heard no speech". Whisper invents text here ("Thanks for watching!", "Let's do it! yeah!"), and that text must never be scored. |
| A8g | A1 with noise at 0 dB and -5 dB SNR (noisy, but still easy to understand) | Analysed normally (mean logprob about -0.3 to -0.6). The clarity check must not reject real speech that is noisy but intelligible. |
| A9 | Topic "climate change", but the speech is about cooking pasta | `contentQualityAnalysis.contextAlignment.status` is "off-topic" or "partial", and it matches the summary (I19). `overallScoreRationale` starts with that summary. Grammar doesn't rewrite the speech to be about the topic. |
| A10 | `purposeKey: "reading-exercise"` with a `readingPassage` of about 60 words. The recording skips one word and swaps another. | `toneAnalysis.readingCheck` lists the skipped and misread words. `improvedTranscription` equals the passage. `toneSuggestions.phrases` is empty. `categoryScores` has no Structure. |
| A13 | Request sent with any `accent` (e.g. `"fr-FR"`) | 200. The accent is ignored and echoed as en-US, and the improved audio is the US voice. |
| A14 | A1's audio without `pcm16kBase64` | 200. `toneAnalysis.measured` is absent and mispronounced words have no `score` (GPT estimate). The report still renders. |
| A15 | A1 sent as `.m4a` with `mimeType: "audio/mp4"` | 200. The header sniffing handles the wrong MIME type. |
| A16 | A1 converted to WAV, `mimeType: "audio/wav"` | 200. |
| A17 | No `audioBase64` | 400 with "No recording was received." |
| A18 | `audioBase64` over 25 MB (pad with random bytes) | 413 with the size message, returned before any OpenAI call. |
| A19 | 2 KB of random bytes labelled audio/webm | A non-200 with a readable `error` message, not a stack trace. |
| A20 | A sentence that repeats a word the speaker may slur, e.g. "the" five times | Check I13. Note which occurrence was flagged. |
| A21 | `purposeKey: "job-interview"` with `practicePrompt: "Tell me about yourself"`, answered on-topic | `speechConfig.practicePrompt` is echoed. Content alignment is "aligned". |
| A22 | Re-run A1 twice | Scores stay within about ±10 between runs. Report the spread. |
| A23 | Student-council speech at `-r 150` with "Thank you", "I've been class representative", "First, extend library hours. Second, add more clubs." and "um"/"uh" | I17, I18, I20 and I21 pass. No error-kind grammar issue for the article or the list items. The Grammar score doesn't drop below 60 because of comma-joined clauses. |
| A24 | A1's text with one middle sentence at `[[rate 300]]` | Exactly one "Rushed" pace highlight, on the fast sentence. No other Rushed highlight. |

Also test the `openai-tts` function. Serve it the same way on another port (check how it reads its port). Send 5,000 characters of text and expect audio back, not an OpenAI length error.

## 3. Web app (browser)

Use Playwright or another browser automation tool if you have one. To feed a recording through the mic, launch Chrome with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=e2e/a.wav`. If you have no browser tool, turn this section into a numbered manual checklist for me instead.

Sign in with a test account, not a real customer account. Reports are saved to the real Supabase database.

| ID | Steps | Expect |
|---|---|---|
| U1 | Open `/`, `/practice` and `/about` signed out | Each redirects to `/auth`. After signing in, each page loads. Sign-out works. |
| U2 | Configure a presentation (topic set, en-US), record about 30 s with the fake mic, analyse | The full report renders. The header score matches the score card. There are no console errors and no blank cards. |
| U3 | Upload an m4a, a wav and an mp3 | Each analyses. Uploading a `.txt` file shows a friendly error toast. |
| U4 | Analyse once, then record and analyse again | The new report's audio and improved speech replace the old ones, and nothing from the previous report plays. |
| U5 | Improved Speech tab: play each player, then switch tabs while audio plays | Only one clip plays at a time. A tab switch stops playback. No accent buttons. Every clip is the US voice. |
| U6 | Transcript highlights | Fillers, pace and repetition spans are highlighted. A mispronounced word is highlighted only at its flagged occurrence. No tooltip shows "undefined". |
| U7 | Pronunciation card | When Azure ran it reads "Scored N/100" and "scored 0-100 … standard pronunciation", with no accent picker or "Scored against" line. Without Azure it says the words were estimated. The Recommendations list only pronunciation advice. |
| U8 | Mood & Tone card on the silent recording (A7 audio) | One "Not enough speech" line, with no made-up emotion or delivery badges. |
| U9 | History: open a saved report, reload the page, open it again | Same scores, transcript and topic as when first shown. Audio plays, or is absent without errors. An old report saved with a non-US accent plays in the US voice: its saved audio is re-made on first play. |
| U10 | History with the network offline (DevTools) | "Couldn't load your past analyses", not "No analyses yet". Opening a report shows "Could not open this report". |
| U11 | Each of the 6 practice modes (Job Interviews, Public Speaking, Storytelling, Debate Topics, Descriptive Narration, Creative Storytelling): record | The report's context is that exercise's prompt. After leaving the mode, the main recorder no longer carries the practice prompt. |
| U12 | Job Interviews: answer Q1, then press Next | The report clears. Prev and Next are disabled while recording or analysing. |
| U13 | Speech configuration | There's no Accent field. Reading exercise: the passage reaches the report (see A10). |
| U14 | Signed-out trial flow, if reachable | The banner count updates right after each analysis. The trial blocks after 5 analyses. |
| U15 | Analysis failure: stop the local function, then analyse | A readable error toast and no stuck spinner. Restart the function afterwards. |
| U16 | Daily limit message: point `VITE_ANALYZE_FUNCTION_URL` at a tiny stub that returns `429 {"error":"You've reached today's limit..."}` | The toast shows that exact message. Restore the env afterwards. |
| U17 | Navigate away while recording | The browser mic indicator turns off. |
| U18 | Repeat U2 at 375 px width | No horizontal scroll, and every card is readable. |
| U19 | Whole app | No accent picker or accent label anywhere. |
| U20 | Record, then stop, on the main recorder and in each practice mode | No Play/Pause button appears under the record button. It was removed on purpose. The only players are in the report's Transcript tab. |
| U21 | Real mic, silent: record 5 s with the mic muted or covered, then analyse | A "not enough speech" report with every score 0. Never a scored report with invented text (a real report once scored 70/100 for silence, with the transcript "five different audiences"). |
| U22 | Open an older report in History that has a spelling issue saved in its grammar section | The Grammar card, Vocabulary card, Tips and transcript highlights show no spelling, typo, punctuation or capitalization item (I16 applies to old reports too). |
| U23 | Open an older report saved before the spoken-grammar rules (one with "I I", article or punctuation grammar issues) | I16-I20 hold in the card view. The Grammar score and text in Overview match the issues still shown, so there is no "67" next to a card with 0 errors. |
| U24 | Any report with a low score whose model colour was green, e.g. flat pitch | Badges and text colours follow the score. A low score never shows green. |
| U25 | Transcript tooltips on grammar highlights | They read "Say ..." or "Optional polish - say ...", never "Grammar: Grammar:". |

## 4. Report back

1. A results table with ID, pass/fail and one line of evidence (the actual value seen), covering every A, U and I check.
2. For each failure:
   - the root cause, with `file:line`
   - whether it's an app bug or a test or environment issue (for example, Whisper dropping a TTS "um")
3. Fix the app bugs you're confident about. Fix the root cause in the shared function, not just the one caller. Re-run the failing case and the section 0 checks after each fix, and list every file you changed.
4. List anything you couldn't test and why: no Azure keys, no browser tool, and so on.
5. Give me the total number of analysis calls you made.
