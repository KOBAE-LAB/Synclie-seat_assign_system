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
  folders,
}: {
  lectureId: number;
  initial: {
    name: string;
    lectureDate: string;
    messageJa: string;
    messageFurigana: string;
    messageEn: string;
    memo: string;
    folder: string;
    tags: string[];
  };
  translationAvailable: boolean;
  folders: string[];
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

      <fieldset className="editor-panel">
        <legend>整理用（学生には見えません）</legend>
        <label className="field">
          <span className="field__label">メモ</span>
          <textarea className="input" name="memo" rows={3} maxLength={2000} defaultValue={initial.memo} placeholder="例：教科書 p.20 から。欠席連絡 2 名。" />
        </label>
        <label className="field">
          <span className="field__label">フォルダ</span>
          <input className="input" name="folder" maxLength={50} defaultValue={initial.folder} list="folder-list" placeholder="例：2026 前期 情報リテラシー" />
          <datalist id="folder-list">
            {folders.map((f) => <option key={f} value={f} />)}
          </datalist>
        </label>
        <label className="field">
          <span className="field__label">タグ</span>
          <input className="input" name="tags" defaultValue={initial.tags.join(", ")} placeholder="例：1年, 必修, グループワーク" />
          <span className="field__hint">カンマ（,）か読点（、）で区切ります。10 個まで。</span>
        </label>
      </fieldset>

      {note ? <p className="small" role="status">{busy ? "処理中…" : note}</p> : null}
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="button" disabled={pending || busy}>{pending ? "保存中…" : "保存する"}</button>
    </form>
  );
}
