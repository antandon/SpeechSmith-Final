import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// e.g. withIndefiniteArticle("Upbeat") -> "an Upbeat", withIndefiniteArticle("Job interview") -> "a Job interview"
export function withIndefiniteArticle(word: string): string {
  const article = /^[aeiou]/i.test(word) ? 'an' : 'a';
  return `${article} ${word}`;
}

// One colour scale for every score in the app, so the same number always looks the same.
// A server verdict colour (e.g. flat pitch is never green) can only make a score look worse, never better.
const verdictLevel: Record<string, number> = { yellow: 1, red: 2 };
const scoreLevel = (score: number, color?: string) =>
  Math.max(score >= 80 ? 0 : score >= 60 ? 1 : 2, verdictLevel[color ?? ''] ?? 0);
export const scoreText = (score: number, color?: string) => ['text-green-600', 'text-amber-600', 'text-red-600'][scoreLevel(score, color)];
export const scoreBadge = (score: number, color?: string) => ['bg-green-100 text-green-700', 'bg-amber-100 text-amber-700', 'bg-red-100 text-red-700'][scoreLevel(score, color)];
export const scoreBar = (score: number, color?: string) => ['bg-green-500', 'bg-amber-500', 'bg-red-500'][scoreLevel(score, color)];
