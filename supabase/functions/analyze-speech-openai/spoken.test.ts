import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isFillerLike, punctuatedWords, keepsSpeakersWords, withoutInventedStats, isFillerOnly, isWrittenOnlyIssue, classifyGrammarFix, consistentAlignmentStatus, courtesyContentIssue, grammarVerdict, isCourtesy, isHesitation, spokenWords } from "./spoken.ts";

Deno.test("grammar fixes that aren't spoken mistakes", () => {
  // Repeats are scored under Repetition, not Grammar.
  assertEquals(classifyGrammarFix("I I went there", "I went there"), 'drop');
  assertEquals(classifyGrammarFix("we we can", "we can"), 'drop');
  assertEquals(classifyGrammarFix("how I cook pasta at home.", "why remote work is good for employees."), 'drop');
  assertEquals(classifyGrammarFix("Me go", "I went"), 'keep');
  // Optional article / list-item subject: polish, not an error.
  // An article before an abstract noun or plural that reads fine without one isn't a fix at all.
  assertEquals(classifyGrammarFix("gives people flexibility", "gives people the flexibility"), 'drop');
  assertEquals(classifyGrammarFix("so we had options", "so we had the options"), 'drop');
  assertEquals(classifyGrammarFix("I took class yesterday", "I took a class yesterday"), 'optional');
  assertEquals(classifyGrammarFix("I've been class representative", "I've been a class representative"), 'optional');
  assertEquals(classifyGrammarFix("First, extend library hours", "First, I will extend library hours"), 'optional');
  // Real errors stay.
  assertEquals(classifyGrammarFix("she go to school", "she goes to school"), 'keep');
  assertEquals(classifyGrammarFix("She happy", "She is happy"), 'keep');
  assertEquals(classifyGrammarFix("so basically we went", "we went"), 'drop');
  assertEquals(classifyGrammarFix("I asked, do you know what time it is, and she left", "I asked, and she left"), 'drop');
  assertEquals(classifyGrammarFix("it is more better", "it is better"), 'keep');
  assertEquals(classifyGrammarFix("I laid down on the sofa", "I lay down on the sofa"), 'drop');
  assertEquals(classifyGrammarFix("their was a problem", "there was a problem"), 'drop');
  assertEquals(classifyGrammarFix("we have two auctions", "we have two options"), 'drop');
  assertEquals(classifyGrammarFix("she go to school", "she went to school"), 'keep');
  assertEquals(isFillerOnly(["basically"]), true);
  assertEquals(isFillerOnly(["really", "important"]), false);
  assertEquals(classifyGrammarFix("more better", "better"), 'keep');
  assertEquals(isWrittenOnlyIssue('sentence structure', 'Using semicolons helps clarify the list structure.'), true);
  assertEquals(isWrittenOnlyIssue('subject-verb agreement', "'like' should be 'likes' to match 'my brother'."), false);
});

Deno.test("courtesy, hesitation and alignment", () => {
  assertEquals(isCourtesy("Thank you."), true);
  assertEquals(isCourtesy("thank you for the very bad service we had"), false);
  assertEquals(courtesyContentIssue('vague', 'Thank you'), 'drop');
  assertEquals(courtesyContentIssue('weak-closing', 'Thank you'), 'unquote');
  assertEquals(isHesitation("Ummm"), true);
  assertEquals(isHesitation("you know"), false);
  assertEquals(consistentAlignmentStatus('partial', 'The speech is entirely off topic, about pasta.'), 'off-topic');
  // Never addressing the topic is off topic, not partial.
  assertEquals(consistentAlignmentStatus('partial', 'The speech describes a project and does not address the topic.'), 'off-topic');
  assertEquals(consistentAlignmentStatus('partial', "It never mentions remote work at all."), 'off-topic');
  assertEquals(consistentAlignmentStatus('partial', 'A project story unrelated to the topic of remote work.'), 'off-topic');
  assertEquals(consistentAlignmentStatus('partial', 'It only mentions remote work in passing; the speech is about a launch.'), 'off-topic');
  assertEquals(consistentAlignmentStatus('partial', 'The main focus is a client project rather than remote work.'), 'off-topic');
  assertEquals(consistentAlignmentStatus('partial', "Covers remote work but doesn't address the topic's downsides.", 1), 'partial');
  assertEquals(consistentAlignmentStatus('aligned', 'A story, but it lacks a clear depiction of the decision.'), 'partial');
  assertEquals(consistentAlignmentStatus('aligned', 'Directly answers the question with examples.'), 'aligned');
  assertEquals(consistentAlignmentStatus('aligned', 'Answers the question, focusing on practice rather than theory.'), 'aligned');
  assertEquals(consistentAlignmentStatus('aligned', "Describes the scene but doesn't tell a story."), 'partial');
  assertEquals(consistentAlignmentStatus('partial', 'Fully answers the question with a clear example.'), 'aligned');
  assertEquals(consistentAlignmentStatus('partial', 'Covers part of the question.', 1), 'partial');
  assertEquals(consistentAlignmentStatus('partial', 'The answer aligns well with the question, naming Python and Java.', 1), 'aligned');
  assertEquals(consistentAlignmentStatus('partial', 'It aligns well but lacks a concrete project.', 1), 'partial');
});

Deno.test("grammar verdict counts only errors", () => {
  const v = grammarVerdict([{ kind: 'refinement', original: 'a', corrected: 'b' }, { kind: 'error', original: 'she go', corrected: 'she goes' }], "One. Two. Three.");
  assertEquals(v.score, 67);
  // A 60-word speech Whisper punctuated as one sentence still counts as ~4 sentences.
  const long = Array(60).fill('word').join(', ') + '.';
  assertEquals(grammarVerdict([{ kind: 'error', original: 'x', corrected: 'y' }], long).score, 75);
});

Deno.test("invented stats and content-changing tone rewrites", () => {
  assertEquals(withoutInventedStats("Say remote workers are 20% more productive, saving $5,000.", "I like remote work"), "Say remote workers are [your figure] more productive, saving [your figure].");
  assertEquals(withoutInventedStats("Repeat that 40% figure.", "about 40% of us work remotely"), "Repeat that 40% figure.");
  assertEquals(withoutInventedStats("Use 3 clear points.", "hello"), "Use 3 clear points.");
  assertEquals(keepsSpeakersWords("it's not just a trend", "it's a transformative shift"), false);
  assertEquals(keepsSpeakersWords("I think we should try it", "We should absolutely try it"), true);
  assertEquals(keepsSpeakersWords("like, really changing how we, like, do our jobs", "fundamentally transforming how we approach our jobs"), false);
  assertEquals(keepsSpeakersWords("remote work is, like, really changing how we do our jobs", "Remote work is truly changing how we do our jobs!"), true);
});

Deno.test("filler 'like' vs the verb/preposition", () => {
  const text = "So, um, remote work is, like, really changing how we, like, do our jobs. I think, like, people are more productive. I was like no way. Like, it works.";
  const words = spokenWords(text).split(' ');
  const raw = punctuatedWords(words, text);
  const likes = words.flatMap((w, i) => (w === 'like' && isFillerLike(raw[i - 1] ?? '', raw[i], raw[i + 1] ?? '') ? [i] : []));
  assertEquals(likes.length, 5);
  for (const real of ["I like pizza a lot.", "It looks like rain.", "I feel like going out.", "We would like more time.", "It was like a dream.", "Cities, like Paris, are busy.", "Like I said, it works."]) {
    const ws = spokenWords(real).split(' '), rs = punctuatedWords(ws, real);
    assertEquals(ws.some((w, i) => w === 'like' && isFillerLike(rs[i - 1] ?? '', rs[i], rs[i + 1] ?? '')), false, real);
  }
});

Deno.test("a fix that only removes fillers isn't a grammar error", () => {
  assertEquals(classifyGrammarFix("remote work is, like, really changing how we, like, do our jobs", "remote work is really changing how we do our jobs"), 'drop');
  assertEquals(classifyGrammarFix("she go, like, home", "she goes home"), 'keep');
});
