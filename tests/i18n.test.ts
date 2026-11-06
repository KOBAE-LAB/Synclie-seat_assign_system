import { test } from "node:test";
import assert from "node:assert/strict";
import { annotateWord, parseRuby, stripRuby, toHiragana } from "../src/lib/i18n/ruby.ts";
import { addFurigana } from "../src/lib/i18n/furigana.ts";
import { STUDENT_TEXT } from "../src/lib/i18n/student-text.ts";

test("ふりがな表記の分解と除去", () => {
  assert.deepEqual(parseRuby("荷物(にもつ)は足元（あしもと）に"), [
    { text: "荷物", ruby: "にもつ" },
    { text: "は" },
    { text: "足元", ruby: "あしもと" },
    { text: "に" },
  ]);
  // かな以外のかっこ書きはふりがなとみなさない
  assert.deepEqual(parseRuby("講義(必修)"), [{ text: "講義(必修)" }]);
  assert.equal(stripRuby("置(お)いてください"), "置いてください");
});

test("送り仮名を外に出してふりがなを付ける", () => {
  assert.equal(toHiragana("タベル"), "たべる");
  assert.equal(annotateWord("食べる", "タベル"), "食(た)べる");
  assert.equal(annotateWord("取り扱い", "トリアツカイ"), "取(と)り扱(あつか)い");
  assert.equal(annotateWord("講義", "コウギ"), "講義(こうぎ)");
  assert.equal(annotateWord("ください", "クダサイ"), "ください");
  assert.equal(annotateWord("お茶", "オチャ"), "お茶(ちゃ)");
});

test("kuromoji で文全体にふりがなを付ける", async () => {
  const out = await addFurigana("荷物は足元に置いてください。");
  assert.equal(out, "荷物(にもつ)は足元(あしもと)に置(お)いてください。");
  assert.equal(stripRuby(out), "荷物は足元に置いてください。");
  // すでに付いていても付け直す（二重にならない）
  assert.equal(await addFurigana(out), out);
  assert.equal(await addFurigana("ABC 123"), "ABC 123");
});

test("学生画面の文言は 3 言語そろっている", () => {
  for (const [key, v] of Object.entries(STUDENT_TEXT)) {
    assert.equal(stripRuby(v.ruby), v.ja, `${key}: ふりがな版を外すと日本語版と同じ`);
    if (v.ja) assert.ok(v.en || key === "seatSuffix" || key === "desu", `${key}: 英語がある`);
  }
});
