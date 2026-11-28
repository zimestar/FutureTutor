import type { LibrarySheet } from "@/content/library";

/**
 * LIBRARY-2 — compact builder for library sheets. Every text is a
 * [français, English] pair; French uses decimal commas and spaced thousands,
 * English uses decimal points. New sheets start as drafts until a tutor
 * reviews them.
 */
export type Pair = readonly [fr: string, en: string];

export interface SheetSpec {
  summary: Pair;
  mustKnow: Pair[];
  explanation: Pair[];
  examples: { problem: Pair; steps: Pair[]; answer: Pair }[];
  mistakes: Pair[];
  /** [question, answer] */
  practice: [Pair, Pair][];
  tips: Pair[];
}

const l = ([fr, en]: Pair) => ({ fr, en });

export function sheet(spec: SheetSpec): LibrarySheet {
  return {
    reviewStatus: "draft",
    summary: l(spec.summary),
    mustKnow: spec.mustKnow.map(l),
    explanation: spec.explanation.map(l),
    examples: spec.examples.map((e) => ({ problem: l(e.problem), steps: e.steps.map(l), answer: l(e.answer) })),
    commonMistakes: spec.mistakes.map(l),
    practice: spec.practice.map(([q, a]) => ({ question: l(q), answer: l(a) })),
    parentTips: spec.tips.map(l),
  };
}

/** Same text in both languages (pure math notation). */
export const same = (text: string): Pair => [text, text];
