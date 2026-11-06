"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { checkStatusAction, drawAction, type StudentStatus } from "@/app/d/actions";
import { Ruby } from "@/components/Ruby";
import { SeatMap, type SeatView } from "@/components/seating/SeatMap";
import { ERROR_TEXT_KEY, LANGS, STUDENT_TEXT, type Lang, type StudentTextKey } from "@/lib/i18n/student-text";
import type { ClassroomLayout } from "@/lib/seating/layout";
import type { AcceptState } from "@/lib/seating/lectures";

const DEVICE_KEY = "synclie-seat-assign:device-id";
const LANG_KEY = "synclie-seat-assign:lang";

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

function getSavedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "ja" || v === "ruby" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

export type StudentMessage = { ja: string; furigana: string; en: string };

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
  message: StudentMessage;
  initialState: AcceptState;
  layout: ClassroomLayout;
  seats: SeatView[];
}) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [lang, setLangState] = useState<Lang>("ja");
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
    const saved = getSavedLang();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage はマウント後にしか読めない
    setDeviceId(id);
    if (saved) setLangState(saved);
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

  function setLang(next: Lang) {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // 保存できなくても表示は切り替える
    }
  }

  function onDraw() {
    if (!deviceId) return;
    startTransition(async () => {
      setStatus(await drawAction(token, deviceId));
    });
  }

  /** 文言を今の言語で表示する */
  const tx = (k: StudentTextKey) => <Ruby text={STUDENT_TEXT[k][lang]} showRuby={lang === "ruby"} />;

  const result = status.result;
  const state = status.acceptState ?? initialState;
  const messageText =
    lang === "en" ? message.en || message.ja : lang === "ruby" ? message.furigana || message.ja : message.ja;
  const messageLang = lang === "en" && message.en ? "en" : "ja";

  return (
    <div lang={lang === "en" ? "en" : "ja"}>
      <div className="lang-switch" role="group" aria-label="表示言語 / Language">
        {LANGS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={l.id === lang ? "lang-switch__button lang-switch__button--active" : "lang-switch__button"}
            aria-pressed={l.id === lang}
            onClick={() => setLang(l.id)}
          >
            {l.id === "ruby" ? (
              <ruby>
                ふりがな<rt>ruby</rt>
              </ruby>
            ) : (
              l.label
            )}
          </button>
        ))}
      </div>

      <section className="card">
        <p className="small muted" lang="ja">{lectureName}</p>
        {result ? (
          <div className="result" role="status" aria-live="polite">
            <p className="result__lead">{tx("yourSeatIs")}</p>
            <p className="result__seat">
              {lang === "en" ? <span className="result__prefix">{tx("seatPrefix")} </span> : null}
              <strong>{result.seatNumber}</strong>
              {tx("seatSuffix")}
              {result.groupName ? (
                <span className="result__group" style={{ borderColor: result.groupColor ?? undefined }}>
                  {lang === "en" ? "(" : "（"}
                  {tx("group")} {result.groupName}
                  {lang === "en" ? ")" : "）"}
                </span>
              ) : null}
            </p>
            {lang !== "en" ? <p className="result__lead">{tx("desu")}</p> : null}
          </div>
        ) : !loaded ? (
          <p className="muted">{tx("loading")}</p>
        ) : state === "open" ? (
          <div className="draw-area">
            <button type="button" className="button button--draw" onClick={onDraw} disabled={pending || !deviceId}>
              {pending ? tx("drawing") : tx("draw")}
            </button>
            <p className="small muted">{tx("oncePerDevice")}</p>
          </div>
        ) : (
          <p className="notice">{state === "before" ? tx("notStarted") : tx("closed")}</p>
        )}
        {status.error ? (
          <p className="form-error" role="alert">{tx(ERROR_TEXT_KEY[status.error])}</p>
        ) : null}
        {message.ja ? (
          <div className="message">
            <p className="message__from small muted">{tx("messageFromTeacher")}</p>
            <p className="message__body" lang={messageLang}>
              <Ruby text={messageText} showRuby={lang === "ruby"} />
            </p>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2 className="h-small">{tx("seatMap")}</h2>
        <SeatMap layout={layout} seats={seats.map((s) => ({ ...s, mine: s.number === result?.seatNumber }))} size="small" />
      </section>
    </div>
  );
}
