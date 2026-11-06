"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { isSameOrigin, requireTeacher } from "@/lib/auth/server";
import { classroomNameError, deleteClassroom, saveClassroom } from "@/lib/seating/classrooms";
import { parseLayout, type GroupMode } from "@/lib/seating/layout";
import {
  createLecture,
  deleteLecture,
  ENROLLED_MAX,
  getLecture,
  MESSAGE_MAX,
  setAcceptState,
  type AcceptState,
} from "@/lib/seating/lectures";
import { cancelDraw, proxyDraw, resetDraws } from "@/lib/seating/draws";

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
  const layout = parseLayout(field(formData, "layout"));
  if (!layout) return { error: "レイアウトのデータが正しくありません。" };
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
