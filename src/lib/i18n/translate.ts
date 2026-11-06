/**
 * 講師のメッセージを英訳する（OpenAI API。キーはサーバーの環境変数 OPENAI_API_KEY のみ）。
 * キーがない・失敗したときは null を返し、講師が手で入力できるようにする。
 */

const DEFAULT_MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 20_000;

export function isTranslationAvailable(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && !key.startsWith("sk-your"));
}

export async function translateToEnglish(text: string): Promise<string | null> {
  const input = text.trim();
  if (!input || !isTranslationAvailable()) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You translate short Japanese announcements from a university teacher to students into natural, concise English. " +
              "Keep numbers, names and line breaks. Output only the translation.",
          },
          { role: "user", content: input },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`英訳に失敗しました（HTTP ${res.status}）`);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const out = data.choices?.[0]?.message?.content?.trim();
    return out ? out.slice(0, 2000) : null;
  } catch (e) {
    console.warn("英訳に失敗しました", e instanceof Error ? e.message : e);
    return null;
  }
}
