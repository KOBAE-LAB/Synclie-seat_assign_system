"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { checkStatusAction, drawAction, type StudentStatus } from "@/app/d/actions";
import { SeatMap, type SeatView } from "@/components/seating/SeatMap";
import type { ClassroomLayout } from "@/lib/seating/layout";
import type { AcceptState } from "@/lib/seating/lectures";

const DEVICE_KEY = "synclie-seat-assign:device-id";

/** ブラウザに保存した匿名の端末 ID（個人情報は含まない） */
function getDeviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    // 保存できないブラウザ（プライベートモード等）ではページを開いている間だけの ID
    return crypto.randomUUID();
  }
}

export function StudentDraw({
  token,
  lectureName,
  message,
  initialState,
  layout,
  seats,
}: {
  token: string;
  lectureName: string;
  message: string;
  initialState: AcceptState;
  layout: ClassroomLayout;
  seats: SeatView[];
}) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [status, setStatus] = useState<StudentStatus>({ found: true, acceptState: initialState, result: null });
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(
    async (id: string) => {
      const s = await checkStatusAction(token, id);
      setStatus((prev) => ({ ...s, error: s.result ? undefined : prev.error }));
      setLoaded(true);
    },
    [token],
  );

  useEffect(() => {
    const id = getDeviceId();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage はマウント後にしか読めない
    setDeviceId(id);
    void refresh(id);
  }, [refresh]);

  // 結果が出るまでは 5 秒ごとに受付状態を確認する
  useEffect(() => {
    if (!deviceId || status.result) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(deviceId);
    }, 5000);
    return () => clearInterval(timer);
  }, [deviceId, status.result, refresh]);

  function onDraw() {
    if (!deviceId) return;
    startTransition(async () => {
      setStatus(await drawAction(token, deviceId));
    });
  }

  const result = status.result;
  const state = status.acceptState ?? initialState;

  return (
    <>
      <section className="card">
        <p className="small muted">{lectureName}</p>
        {result ? (
          <div className="result" role="status" aria-live="polite">
            <p className="result__lead">あなたの座席は</p>
            <p className="result__seat">
              <strong>{result.seatNumber}</strong>番
              {result.groupName ? (
                <span className="result__group" style={{ borderColor: result.groupColor ?? undefined }}>
                  （グループ {result.groupName}）
                </span>
              ) : null}
            </p>
            <p className="result__lead">です。</p>
          </div>
        ) : !loaded ? (
          <p className="muted">読み込み中…</p>
        ) : state === "open" ? (
          <div className="draw-area">
            <button type="button" className="button button--draw" onClick={onDraw} disabled={pending || !deviceId}>
              {pending ? "抽選中…" : "抽選"}
            </button>
            <p className="small muted">1 台の端末で 1 回だけ抽選できます。</p>
          </div>
        ) : (
          <p className="notice">
            {state === "before" ? "まだ抽選の受付が始まっていません。始まると自動で「抽選」ボタンが出ます。" : "抽選の受付は終了しました。"}
          </p>
        )}
        {status.error ? <p className="form-error" role="alert">{status.error}</p> : null}
        {message ? <p className="message">{message}</p> : null}
      </section>

      <section className="card">
        <h2 className="h-small">座席図</h2>
        <SeatMap layout={layout} seats={seats.map((s) => ({ ...s, mine: s.number === result?.seatNumber }))} size="small" />
      </section>
    </>
  );
}
