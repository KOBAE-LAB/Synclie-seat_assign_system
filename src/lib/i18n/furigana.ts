import path from "node:path";
import kuromoji from "kuromoji";
import { annotateWord, hasKanji, stripRuby } from "./ruby.ts";

type Tokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>;

const globalForKuromoji = globalThis as unknown as { __seatAssignTokenizer?: Promise<Tokenizer> };

function getTokenizer(): Promise<Tokenizer> {
  globalForKuromoji.__seatAssignTokenizer ??= new Promise((resolve, reject) => {
    // 辞書は node_modules に同梱されている（実行時に読み込むのでビルドのトレース対象から外す）
    const dicPath = path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules", "kuromoji", "dict");
    kuromoji.builder({ dicPath }).build((err, tokenizer) => (err ? reject(err) : resolve(tokenizer)));
  });
  return globalForKuromoji.__seatAssignTokenizer;
}

/**
 * 日本語の文に「漢字(よみ)」形式のふりがなを付ける（サーバー側のみ）。
 * すでにふりがな表記が含まれていれば、いったん外してから付け直す。
 */
export async function addFurigana(text: string): Promise<string> {
  const plain = stripRuby(text);
  if (!hasKanji(plain)) return plain;
  const tokenizer = await getTokenizer();
  return tokenizer
    .tokenize(plain)
    .map((t) => (t.reading && t.reading !== "*" ? annotateWord(t.surface_form, t.reading) : t.surface_form))
    .join("");
}
