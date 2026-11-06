"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { clientIp, isSameOrigin, requireTeacher } from "@/lib/auth/server";
import {
  classroomNameError,
  copyClassroomByShareCode,
  deleteClassroom,
  issueShareCode,
  revokeShareCode,
  saveClassroom,
} from "@/lib/seating/classrooms";
import { RATE_LIMIT_MESSAGE, RateLimiter } from "@/lib/auth/rate-limit";
import { validateLayout, type GroupMode } from "@/lib/seating/layout";
import {
  createLecture,
  deleteLecture,
  ENROLLED_MAX,
  getLecture,
  MESSAGE_MAX,
  setAcceptState,
  FOLDER_MAX,
  issueTtCode,
  MEMO_MAX,
  parseTags,
  revokeTtCode,
  setArchived,
  updateLectureOrganize,
  toggleSeatStatus,
  updateLectureInfo,
  type AcceptState,
} from "@/lib/seating/lectures";
import { cancelDraw, moveDraw, proxyDraw, resetDraws } from "@/lib/seating/draws";
import { addFurigana } from "@/lib/i18n/furigana";
import { isTranslationAvailable, translateToEnglish } from "@/lib/i18n/translate";

export type ActionState = { error?: string };

const BAD_ORIGIN = "ページを再読み込みしてから、もう一度お試しください。";

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/** CSRF 確認とログイン確認をまとめて行う */
async function teacherOrNull() {
  if (!(await isSameOrigin())) return null;
  return requireTeacher();
}

async function ownedLecture(lectureId: number) {
  const teacher = await teacherOrNull();
  if (!teacher) return null;
  const lecture = getLecture(getDb(), teacher.teacherId, lectureId);
  return lecture ? { teacher, lecture } : null;
}

export async function saveClassroomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const teacher = await teacherOrNull();
  if (!teacher) return { error: BAD_ORIGIN };
  const name = field(formData, "name");
  const nameError = classroomNameError(name);
  if (nameError) return { error: nameError };
  const checked = validateLayout(field(formData, "layout"));
  if (!checked.ok) return { error: checked.error };
  const layout = checked.layout;
  if (layout.seats.length === 0) return { error: "席を 1 つ以上置いてください。" };
  const idText = field(formData, "id");
  const id = saveClassroom(getDb(), teacher.teacherId, { id: idText ? Number(idText) : undefined, name, layout });
  if (!id) return { error: "教室が見つかりません。" };
  redirect("/teacher?saved=classroom");
}

export async function deleteClassroomAction(classroomId: number): Promise<void> {
  const teacher = await teacherOrNull();
  if (!teacher) redirect("/teacher");
  const result = deleteClassroom(getDb(), teacher.teacherId, classroomId);
  redirect(result === "in_use" ? `/teacher/classrooms/${classroomId}?error=in_use` : "/teacher");
}

export async function createLectureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const teacher = await teacherOrNull();
  if (!teacher) return { error: BAD_ORIGIN };
  const name = field(formData, "name");
  if (!name) return { error: "講義名を入力してください。" };
  if (name.length > 100) return { error: "講義名は 100 文字以内にしてください。" };
  const classroomId = Number(field(formData, "classroomId"));
  if (!classroomId) return { error: "教室を選んでください。" };
  const enrolled = Number(field(formData, "enrolledCount"));
  if (!Number.isInteger(enrolled) || enrolled < 1 || enrolled > ENROLLED_MAX) {
    return { error: `受講者数は 1〜${ENROLLED_MAX} の整数で入力してください。` };
  }
  const date = field(formData, "lectureDate");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "日付の形式が正しくありません。" };
  const messageJa = field(formData, "messageJa");
  if (messageJa.length > MESSAGE_MAX) return { error: `メッセージは ${MESSAGE_MAX} 文字以内にしてください。` };

  let groupMode: GroupMode = { kind: "none" };
  const mode = field(formData, "groupMode");
  if (mode === "island") groupMode = { kind: "island" };
  if (mode === "count") {
    const count = Number(field(formData, "groupCount"));
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      return { error: "グループ数は 1〜50 の整数で入力してください。" };
    }
    groupMode = { kind: "count", count };
  }

  const id = createLecture(getDb(), teacher.teacherId, {
    classroomId,
    name,
    lectureDate: date || null,
    enrolledCount: enrolled,
    messageJa,
    // ふりがな・英訳は自動で作る（英訳は API キーがあるときだけ。あとで講義の設定から直せる）
    messageFurigana: messageJa ? await safeFurigana(messageJa) : "",
    messageEn: messageJa ? ((await translateToEnglish(messageJa)) ?? "") : "",
    groupMode,
  });
  if (!id) return { error: "教室が見つからないか、席がありません。" };
  redirect(`/teacher/lectures/${id}`);
}

export async function setAcceptStateAction(lectureId: number, state: AcceptState): Promise<void> {
  const owned = await ownedLecture(lectureId);
  if (owned) setAcceptState(getDb(), owned.teacher.teacherId, lectureId, state);
  redirect(`/teacher/lectures/${lectureId}`);
}

export async function proxyDrawAction(lectureId: number): Promise<void> {
  const owned = await ownedLecture(lectureId);
  if (!owned) redirect("/teacher");
  const result = proxyDraw(getDb(), lectureId);
  const q = result
    ? `proxy=${result.seatNumber}${result.groupName ? `&group=${encodeURIComponent(result.groupName)}` : ""}`
    : "error=full";
  redirect(`/teacher/lectures/${lectureId}?${q}`);
}

export async function cancelDrawAction(lectureId: number, drawId: number): Promise<void> {
  const owned = await ownedLecture(lectureId);
  if (owned) cancelDraw(getDb(), lectureId, drawId);
  redirect(`/teacher/lectures/${lectureId}`);
}

export async function resetDrawsAction(lectureId: number): Promise<void> {
  const owned = await ownedLecture(lectureId);
  if (owned) resetDraws(getDb(), lectureId);
  redirect(`/teacher/lectures/${lectureId}`);
}

export async function deleteLectureAction(lectureId: number): Promise<void> {
  const owned = await ownedLecture(lectureId);
  if (owned) deleteLecture(getDb(), owned.teacher.teacherId, lectureId);
  redirect("/teacher");
}

export async function moveDrawAction(lectureId: number, drawId: number, formData: FormData): Promise<void> {
  const owned = await ownedLecture(lectureId);
  if (!owned) redirect("/teacher");
  const target = Number(field(formData, "target"));
  const result = Number.isInteger(target) ? moveDraw(getDb(), lectureId, drawId, target) : "not_found";
  const q = result === "moved" || result === "swapped" ? `?moved=${result}&to=${target}` : "";
  redirect(`/teacher/lectures/${lectureId}${q}`);
}

/** 使用席 ⇔ 予備席の切り替え（クライアントから呼ぶ。画面は呼び出し側で更新する） */
export async function toggleSeatStatusAction(lectureId: number, seatNumber: number): Promise<"used" | "spare" | null> {
  const owned = await ownedLecture(lectureId);
  if (!owned || !Number.isInteger(seatNumber)) return null;
  return toggleSeatStatus(getDb(), owned.teacher.teacherId, lectureId, seatNumber);
}

async function safeFurigana(text: string): Promise<string> {
  try {
    return await addFurigana(text);
  } catch (e) {
    console.warn("ふりがなの自動生成に失敗しました", e);
    return "";
  }
}

/** ふりがなを自動で付ける（講義の設定画面のボタン用） */
export async function generateFuriganaAction(text: string): Promise<{ text?: string; error?: string }> {
  if (!(await teacherOrNull())) return { error: BAD_ORIGIN };
  if (typeof text !== "string" || text.length > MESSAGE_MAX) return { error: "メッセージが長すぎます。" };
  const out = await safeFurigana(text);
  return out || !text ? { text: out } : { error: "ふりがなを作れませんでした。手で入力してください。" };
}

/** 英訳を自動で作る（講義の設定画面のボタン用） */
export async function translateAction(text: string): Promise<{ text?: string; error?: string }> {
  if (!(await teacherOrNull())) return { error: BAD_ORIGIN };
  if (typeof text !== "string" || text.length > MESSAGE_MAX) return { error: "メッセージが長すぎます。" };
  if (!isTranslationAvailable()) return { error: "サーバーに OpenAI API キーが設定されていないため、自動英訳は使えません。手で入力してください。" };
  const out = await translateToEnglish(text);
  return out ? { text: out } : { error: "英訳に失敗しました。しばらくしてからもう一度試すか、手で入力してください。" };
}

export async function updateLectureAction(lectureId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const owned = await ownedLecture(lectureId);
  if (!owned) return { error: BAD_ORIGIN };
  const name = field(formData, "name");
  if (!name) return { error: "講義名を入力してください。" };
  if (name.length > 100) return { error: "講義名は 100 文字以内にしてください。" };
  const date = field(formData, "lectureDate");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "日付の形式が正しくありません。" };
  const messageJa = field(formData, "messageJa");
  let messageFurigana = field(formData, "messageFurigana");
  const messageEn = field(formData, "messageEn");
  for (const [label, v] of [["メッセージ", messageJa], ["ふりがな", messageFurigana], ["英語", messageEn]] as const) {
    if (v.length > MESSAGE_MAX * 2) return { error: `${label}が長すぎます。` };
  }
  // ふりがなが空ならここで自動で付ける
  if (messageJa && !messageFurigana) messageFurigana = await safeFurigana(messageJa);
  const memo = field(formData, "memo");
  if (memo.length > MEMO_MAX) return { error: `メモは ${MEMO_MAX} 文字以内にしてください。` };
  const folder = field(formData, "folder");
  if (folder.length > FOLDER_MAX) return { error: `フォルダ名は ${FOLDER_MAX} 文字以内にしてください。` };
  updateLectureOrganize(getDb(), owned.teacher.teacherId, lectureId, { memo, folder, tags: parseTags(field(formData, "tags")) });
  updateLectureInfo(getDb(), owned.teacher.teacherId, lectureId, {
    name,
    lectureDate: date || null,
    messageJa,
    messageFurigana: messageJa ? messageFurigana : "",
    messageEn: messageJa ? messageEn : "",
  });
  redirect(`/teacher/lectures/${lectureId}?saved=info`);
}

export async function issueTtCodeAction(lectureId: number): Promise<void> {
  const owned = await ownedLecture(lectureId);
  if (owned) issueTtCode(getDb(), owned.teacher.teacherId, lectureId);
  redirect(`/teacher/lectures/${lectureId}?tt=${Date.now()}#tt`);
}

export async function revokeTtCodeAction(lectureId: number): Promise<void> {
  const owned = await ownedLecture(lectureId);
  if (owned) revokeTtCode(getDb(), owned.teacher.teacherId, lectureId);
  redirect(`/teacher/lectures/${lectureId}?tt=${Date.now()}#tt`);
}

export async function setArchivedAction(lectureId: number, archived: boolean): Promise<void> {
  const owned = await ownedLecture(lectureId);
  if (owned) setArchived(getDb(), owned.teacher.teacherId, lectureId, archived);
  redirect(archived ? "/teacher?archived=done" : `/teacher/lectures/${lectureId}`);
}

export async function issueShareCodeAction(classroomId: number): Promise<void> {
  const teacher = await teacherOrNull();
  if (teacher) issueShareCode(getDb(), teacher.teacherId, classroomId);
  redirect(`/teacher/classrooms/${classroomId}?share=${Date.now()}#share`);
}

export async function revokeShareCodeAction(classroomId: number): Promise<void> {
  const teacher = await teacherOrNull();
  if (teacher) revokeShareCode(getDb(), teacher.teacherId, classroomId);
  redirect(`/teacher/classrooms/${classroomId}?share=${Date.now()}#share`);
}

const globalForShare = globalThis as unknown as { __seatAssignShareLimiter?: RateLimiter };
// 共有コードの総当たりを防ぐ：10 分に 20 回まで
const shareLimiter = (globalForShare.__seatAssignShareLimiter ??= new RateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 }));

export async function copyClassroomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const teacher = await teacherOrNull();
  if (!teacher) return { error: BAD_ORIGIN };
  if (!shareLimiter.consume(await clientIp())) return { error: RATE_LIMIT_MESSAGE };
  const id = copyClassroomByShareCode(getDb(), teacher.teacherId, field(formData, "code"));
  if (!id) return { error: "共有コードが違うか、無効にされています。" };
  redirect(`/teacher/classrooms/${id}?copied=1`);
}
