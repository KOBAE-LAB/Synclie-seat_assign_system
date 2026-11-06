"use client";

import { useActionState, useState, useTransition } from "react";
import {
  generateFuriganaAction,
  translateAction,
  updateLectureAction,
  type ActionState,
} from "@/app/teacher/seating-actions";
import { Ruby } from "@/components/Ruby";

export function LectureInfoForm({
  lectureId,
  initial,
  translationAvailable,
}: {
  lectureId: number;
  initial: { name: string; lectureDate: string; messageJa: string; messageFurigana: string; messageEn: string };
  translationAvailable: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateLectureAction.bind(null, lectureId),
    {},
  );
  const [messageJa, setMessageJa] = useState(initial.messageJa);
  const [furigana, setFurigana] = useState(initial.messageFurigana);
  const [english, setEnglish] = useState(initial.messageEn);
  const [note, setNote] = useState("");
  const [busy, startTransition] = useTransition();

  function autoFurigana() {
    startTransition(async () => {
      const r = await generateFuriganaAction(messageJa);
      if (r.text !== undefined) setFurigana(r.text);
      setNote(r.error ?? "ふりがなを付けました。読みが違うところは直してください。");
    });
  }
  function autoEnglish() {
    startTransition(async () => {
      const r = await translateAction(messageJa);
      if (r.text) setEnglish(r.text);
      setNote(r.error ?? "英訳しました。必要に応じて直してください。");
    });
  }

  return (
    <form action={formAction}>
      <label className="field">
        <span className="field__label">講義名</span>
        <input className="input" name="name" defaultValue={initial.name} maxLength={100} required />
      </label>
      <label className="field">
        <span className="field__label">日付</span>
        <input className="input input--medium" type="date" name="lectureDate" defaultValue={initial.lectureDate} />
      </label>

      <label className="field">
        <span className="field__label">学生へのメッセージ（日本語）</span>
        <textarea className="input" name="messageJa" rows={3} maxLength={500} value={messageJa} onChange={(e) => setMessageJa(e.target.value)} />
      </label>

      <div className="field">
        <span className="field__label">ふりがな付き</span>
        <span className="field__hint">「漢字(よみ)」の形で書きます。例：荷物(にもつ)は足元(あしもと)に置(お)いてください。空のまま保存すると自動で付けます。</span>
        <textarea className="input" name="messageFurigana" rows={3} value={furigana} onChange={(e) => setFurigana(e.target.value)} aria-label="ふりがな付きのメッセージ" />
        <div className="stack" style={{ marginTop: 4 }}>
          <button type="button" className="button button--secondary button--small" onClick={autoFurigana} disabled={busy || !messageJa}>
            ふりがなを自動で付ける
          </button>
        </div>
        {furigana ? (
          <p className="ruby-preview" aria-label="学生画面での見え方">
            <Ruby text={furigana} />
          </p>
        ) : null}
      </div>

      <div className="field">
        <span className="field__label">英語</span>
        <textarea className="input" name="messageEn" rows={3} value={english} onChange={(e) => setEnglish(e.target.value)} lang="en" aria-label="英語のメッセージ" />
        <div className="stack" style={{ marginTop: 4 }}>
          <button type="button" className="button button--secondary button--small" onClick={autoEnglish} disabled={busy || !messageJa || !translationAvailable}
            title={translationAvailable ? "" : "サーバーに OPENAI_API_KEY が設定されていません"}>
            英訳を自動で作る
          </button>
          {!translationAvailable ? <span className="small muted">自動英訳はサーバーに API キーを設定すると使えます。手で入力もできます。</span> : null}
        </div>
      </div>

      {note ? <p className="small" role="status">{busy ? "処理中…" : note}</p> : null}
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="button" disabled={pending || busy}>{pending ? "保存中…" : "保存する"}</button>
    </form>
  );
}
