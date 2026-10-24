import type { WordStamp } from "./schema";
import type { Measurer, TextStyle } from "./measure";

export interface CaptionLine {
  text: string;
  /** 안전 여유를 곱한 측정 폭(px) */
  width: number;
  wordIndices: number[];
}

export interface CaptionChunk {
  lines: CaptionLine[];
  startSec: number;
  endSec: number;
  firstWord: number;
  lastWord: number;
  /** 단어 하나가 줄 폭보다 넓어 넘친다. 세이프존 검사가 렌더를 막는다. */
  overflow: boolean;
}

export interface CaptionOptions {
  style: TextStyle;
  maxWidth: number;
  /** 1 또는 2 */
  maxLines: 1 | 2;
}

const SENTENCE_END = /[.?!…~]["'”’)\]]*$/u;

function clean(text: string): string {
  return text.normalize("NFC").trim();
}

export function buildCaptionChunks(words: WordStamp[], m: Measurer, opt: CaptionOptions): CaptionChunk[] {
  const w = (s: string) => m.width(s, opt.style);
  const items = words
    .map((word, index) => ({ index, text: clean(word.text), start: word.start, end: word.end }))
    .filter((it) => it.text.length > 0);

  const groups: (typeof items)[] = [];
  let cur: typeof items = [];
  let lines: string[][] = [[]];

  const close = () => {
    if (cur.length) groups.push(cur);
    cur = [];
    lines = [[]];
  };

  for (const it of items) {
    const line = lines[lines.length - 1]!;
    const candidate = [...line, it.text].join(" ");
    if (line.length === 0 || w(candidate) <= opt.maxWidth) {
      line.push(it.text);
    } else if (lines.length < opt.maxLines) {
      lines.push([it.text]);
    } else {
      close();
      lines[0]!.push(it.text);
    }
    cur.push(it);
    if (SENTENCE_END.test(it.text)) close();
  }
  close();

  return groups.map((group, gi) => {
    const texts = group.map((g) => g.text);
    const split = bestSplit(texts, w, opt);
    const lineWords = split === null ? [group] : [group.slice(0, split), group.slice(split)];
    const built: CaptionLine[] = lineWords
      .filter((lw) => lw.length > 0)
      .map((lw) => {
        const text = lw.map((g) => g.text).join(" ");
        return { text, width: w(text), wordIndices: lw.map((g) => g.index) };
      });
    const next = groups[gi + 1];
    return {
      lines: built,
      startSec: group[0]!.start,
      endSec: next ? next[0]!.start : group[group.length - 1]!.end,
      firstWord: group[0]!.index,
      lastWord: group[group.length - 1]!.index,
      overflow: built.some((l) => l.width > opt.maxWidth),
    };
  });
}

/**
 * 조각을 한 줄 또는 두 줄로 나눈다. 한 줄에 들어가면 null.
 * 두 줄이면 긴 줄 폭이 가장 작은 분할점을 고른다(줄 균형).
 */
function bestSplit(texts: string[], w: (s: string) => number, opt: CaptionOptions): number | null {
  if (w(texts.join(" ")) <= opt.maxWidth || texts.length === 1 || opt.maxLines < 2) return null;
  let best = 1;
  let bestScore = Infinity;
  for (let k = 1; k < texts.length; k++) {
    const a = w(texts.slice(0, k).join(" "));
    const b = w(texts.slice(k).join(" "));
    const over = Math.max(0, a - opt.maxWidth) + Math.max(0, b - opt.maxWidth);
    const score = over * 1e6 + Math.max(a, b);
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

export interface EmphasisHit {
  term: string;
  /** 강조 단어가 걸친 단어 인덱스들 */
  wordIndices: number[];
  startSec: number;
}

const normalizeForMatch = (s: string) => s.normalize("NFC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

/**
 * 강조 단어를 단어 타임스탬프에서 찾는다. 조사·문장부호가 붙은 단어("가격은?")와 두 단어에 걸친 강조("단 180g")도 찾는다.
 * 첫 번째 등장만 쓴다. 못 찾은 단어는 missing으로 돌려준다.
 */
export function findEmphasis(words: WordStamp[], terms: string[]): { hits: EmphasisHit[]; missing: string[] } {
  let concat = "";
  const owner: number[] = [];
  words.forEach((word, i) => {
    const n = normalizeForMatch(word.text);
    concat += n;
    for (let k = 0; k < n.length; k++) owner.push(i);
  });
  const hits: EmphasisHit[] = [];
  const missing: string[] = [];
  for (const term of terms) {
    const nt = normalizeForMatch(term);
    const at = nt ? concat.indexOf(nt) : -1;
    if (at < 0) {
      missing.push(term);
      continue;
    }
    const idx = [...new Set(owner.slice(at, at + nt.length))];
    hits.push({ term, wordIndices: idx, startSec: words[idx[0]!]!.start });
  }
  hits.sort((a, b) => a.startSec - b.startSec);
  return { hits, missing };
}
