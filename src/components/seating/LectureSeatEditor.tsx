"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  addGroupAction,
  assignSeatGroupAction,
  deleteGroupAction,
  regroupAction,
  toggleSeatStatusAction,
  updateGroupAction,
  type ActionState,
} from "@/app/teacher/seating-actions";
import { findIslands, type ClassroomLayout } from "@/lib/seating/layout";
import { SeatMap } from "./SeatMap";

type Mode = "view" | "status" | "group";
type SeatRow = { number: number; status: "used" | "spare"; groupId: number | null; groupName: string | null; groupColor: string | null };
type GroupRow = { id: number; name: string; color: string };

/**
 * 講師の講義画面の座席図。
 * 表示のほか、「使用席／予備席」の切り替えと、グループの作成・編集・席の割り当てができる。
 */
export function LectureSeatEditor({
  lectureId,
  layout,
  seats,
  groups,
  takenNumbers,
}: {
  lectureId: number;
  layout: ClassroomLayout;
  seats: SeatRow[];
  groups: GroupRow[];
  takenNumbers: number[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  /** グループ編集で「塗る」グループ（null＝グループなし） */
  const [brush, setBrush] = useState<number | null>(groups[0]?.id ?? null);
  const [wholeIsland, setWholeIsland] = useState(false);
  const [regroupKind, setRegroupKind] = useState("island");
  const [regroupCount, setRegroupCount] = useState("6");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const taken = useMemo(() => new Set(takenNumbers), [takenNumbers]);
  const islands = useMemo(() => findIslands(layout), [layout]);
  const brushGroup = groups.find((g) => g.id === brush);
  // 削除されたグループを塗ろうとしないように
  const activeBrush = brush !== null && !brushGroup ? (groups[0]?.id ?? null) : brush;
  const counts = useMemo(() => {
    const m = new Map<number | null, number>();
    for (const s of seats) m.set(s.groupId, (m.get(s.groupId) ?? 0) + 1);
    return m;
  }, [seats]);

  function run(action: () => Promise<ActionState | "used" | "spare" | null>, done?: string) {
    startTransition(async () => {
      const r = await action();
      if (r && typeof r === "object" && r.error) setMessage(r.error);
      else if (done) setMessage(done);
      router.refresh();
    });
  }

  function onSeatClick(n: number) {
    if (mode === "status") {
      run(async () => {
        const r = await toggleSeatStatusAction(lectureId, n);
        setMessage(r ? `${n}番を${r === "used" ? "使用席" : "予備席"}にしました。` : "変更できませんでした。");
        return null;
      });
      return;
    }
    if (mode === "group") {
      const targets = wholeIsland ? (islands.find((i) => i.includes(n)) ?? [n]) : [n];
      const label = activeBrush === null ? "グループなし" : `グループ ${groups.find((g) => g.id === activeBrush)?.name ?? ""}`;
      run(
        () => assignSeatGroupAction(lectureId, targets, activeBrush),
        targets.length > 1 ? `${targets.length} 席を${label}にしました。` : `${n}番を${label}にしました。`,
      );
    }
  }

  return (
    <div className="lecture-seat-editor">
      <div className="mode-switch" role="group" aria-label="座席図の操作">
        {(
          [
            ["view", "表示"],
            ["status", "使用席／予備席を切り替える"],
            ["group", "グループを編集する"],
          ] as const
        ).map(([m, label]) => (
          <button key={m} type="button" className={m === mode ? "mode-switch__button mode-switch__button--active" : "mode-switch__button"}
            aria-pressed={m === mode} onClick={() => { setMode(m); setMessage(""); }}>
            {label}
          </button>
        ))}
      </div>

      {mode === "status" ? (
        <p className="small muted">席を押すと、使用席 ⇔ 予備席が切り替わります（使用席から先に割り当てます）。</p>
      ) : null}

      {mode === "group" ? (
        <div className="group-panel">
          <p className="small muted">
            「塗る」で選んだグループに、席を押して入れます。抽選済みの学生の画面にも新しいグループが表示されます。
          </p>
          <ul className="group-list">
            {groups.map((g) => (
              <li key={g.id} className={g.id === activeBrush ? "group-row group-row--active" : "group-row"}>
                <label className="group-row__brush">
                  <input type="radio" name="brush" checked={g.id === activeBrush} onChange={() => setBrush(g.id)} />
                  塗る
                </label>
                <input type="color" className="group-row__color" defaultValue={g.color} key={`c-${g.id}-${g.color}`}
                  aria-label={`グループ ${g.name} の色`}
                  onChange={(e) => run(() => updateGroupAction(lectureId, g.id, g.name, e.target.value))} />
                <input className="input input--medium group-row__name" defaultValue={g.name} key={`n-${g.id}-${g.name}`} maxLength={50}
                  aria-label="グループ名"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== g.name) run(() => updateGroupAction(lectureId, g.id, v, g.color), `グループ名を「${v}」にしました。`);
                    else e.target.value = g.name;
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
                <span className="small muted">{counts.get(g.id) ?? 0} 席</span>
                <button type="button" className="button button--secondary button--small"
                  onClick={() => {
                    if (window.confirm(`グループ ${g.name} を削除しますか？（このグループの席は「グループなし」になります）`)) {
                      run(() => deleteGroupAction(lectureId, g.id), `グループ ${g.name} を削除しました。`);
                    }
                  }}>
                  削除
                </button>
              </li>
            ))}
            <li className={activeBrush === null ? "group-row group-row--active" : "group-row"}>
              <label className="group-row__brush">
                <input type="radio" name="brush" checked={activeBrush === null} onChange={() => setBrush(null)} />
                塗る
              </label>
              <span className="group-row__none">グループなし</span>
              <span className="small muted">{counts.get(null) ?? 0} 席</span>
            </li>
          </ul>
          <div className="stack" style={{ alignItems: "center" }}>
            <button type="button" className="button button--secondary button--small" onClick={() => run(() => addGroupAction(lectureId), "グループを追加しました。")}>
              ＋ グループを追加
            </button>
            <label className="small checkbox-inline">
              <input type="checkbox" checked={wholeIsland} onChange={(e) => setWholeIsland(e.target.checked)} />
              島ごとまとめて塗る
            </label>
          </div>
          <details className="regroup">
            <summary>グループをまとめて作り直す</summary>
            <div className="stack" style={{ alignItems: "center", marginTop: 8 }}>
              <select className="input input--select-small" value={regroupKind} onChange={(e) => setRegroupKind(e.target.value)} aria-label="作り直し方">
                <option value="island">島ごとに 1 グループ</option>
                <option value="count">席番号順に N グループ</option>
                <option value="none">グループなし</option>
              </select>
              {regroupKind === "count" ? (
                <label className="small">
                  <input className="input input--tiny" type="number" min={1} max={50} value={regroupCount} onChange={(e) => setRegroupCount(e.target.value)} aria-label="グループ数" /> グループ
                </label>
              ) : null}
              <button type="button" className="button button--secondary button--small"
                onClick={() => {
                  if (window.confirm("今のグループをすべて消して作り直します。よろしいですか？（使用席・予備席はそのままです）")) {
                    run(() => regroupAction(lectureId, regroupKind, Number(regroupCount)), "グループを作り直しました。");
                  }
                }}>
                作り直す
              </button>
            </div>
          </details>
        </div>
      ) : null}

      {message ? <p className="small" role="status">{pending ? "変更中…" : message}</p> : null}

      <SeatMap
        layout={layout}
        seats={seats.map((s) => ({
          number: s.number,
          color: s.groupColor,
          taken: taken.has(s.number),
          spare: s.status === "spare",
          label: s.groupName,
        }))}
        onSeatClick={mode === "view" ? undefined : onSeatClick}
      />
    </div>
  );
}
