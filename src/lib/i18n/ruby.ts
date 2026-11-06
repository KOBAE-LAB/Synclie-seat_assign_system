/**
 * ふりがな表記「漢字(よみ)」の扱い（純粋関数。サーバー・ブラウザの両方で使う）。
 * 例：「荷物(にもつ)は足元(あしもと)に置(お)いてください。」
 */

export type RubySegment = { text: string; ruby?: string };

const KANJI = "\\u4E00-\\u9FFF\\u3400-\\u4DBF\\u3005\\u3006\\u30F6\\u30F5";
const RUBY_PATTERN = new RegExp(`([${KANJI}]+)[(（]([\\u3041-\\u3096\\u30FC]+)[)）]`, "g");

/** 「漢字(よみ)」を含む文字列を、ルビ付きの区切りに分ける */
export function parseRuby(text: string): RubySegment[] {
  const out: RubySegment[] = [];
  let last = 0;
  for (const m of text.matchAll(RUBY_PATTERN)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[1], ruby: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** ふりがな表記を取り除いて元の文に戻す */
export function stripRuby(text: string): string {
  return text.replace(RUBY_PATTERN, "$1");
}

export function hasKanji(text: string): boolean {
  return new RegExp(`[${KANJI}]`).test(text);
}

const isKana = (c: string) => /[ぁ-ゖァ-ヺー]/.test(c);

export function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * 1 語（表層形と読み）にふりがなを付ける。送り仮名は外に出す。
 * 例：("食べる", "たべる") → "食(た)べる"、("取り扱い", "とりあつかい") → "取(と)り扱(あつか)い"
 */
export function annotateWord(surface: string, readingKana: string): string {
  if (!hasKanji(surface) || !readingKana) return surface;
  const reading = toHiragana(readingKana);
  if (toHiragana(surface) === reading) return surface;

  // 表層形のかな部分を手がかりに、漢字のかたまりごとの読みを当てはめる
  const parts = surface.match(new RegExp(`[${KANJI}]+|[^${KANJI}]+`, "g")) ?? [surface];
  const pattern = parts
    .map((p) => (hasKanji(p) ? "(.+?)" : toHiragana(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  const m = new RegExp(`^${pattern}$`).exec(reading);
  if (m) {
    let i = 1;
    return parts.map((p) => (hasKanji(p) ? `${p}(${m[i++]})` : p)).join("");
  }
  // 当てはまらなければ、前後の共通するかなだけ外に出して全体に付ける
  let start = 0;
  while (start < surface.length && isKana(surface[start]) && toHiragana(surface[start]) === reading[start]) start++;
  let end = 0;
  while (
    end < surface.length - start &&
    isKana(surface[surface.length - 1 - end]) &&
    toHiragana(surface[surface.length - 1 - end]) === reading[reading.length - 1 - end]
  ) end++;
  const core = surface.slice(start, surface.length - end);
  const coreReading = reading.slice(start, reading.length - end);
  return `${surface.slice(0, start)}${core}(${coreReading})${surface.slice(surface.length - end)}`;
}
