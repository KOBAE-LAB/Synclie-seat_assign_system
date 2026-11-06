"use server";

import { getDb } from "@/lib/db";
import { clientIp } from "@/lib/auth/server";
import { RateLimiter } from "@/lib/auth/rate-limit";
import { drawForDevice, findDeviceDraw, isValidDeviceId, type DrawResult } from "@/lib/seating/draws";
import type { AcceptState } from "@/lib/seating/lectures";
import type { StudentErrorCode } from "@/lib/i18n/student-text";

export type StudentStatus = {
  found: boolean;
  acceptState: AcceptState | null;
  result: DrawResult | null;
  /** 文言は画面側で言語に合わせて出す */
  error?: StudentErrorCode;
};

const globalForDraw = globalThis as unknown as { __seatAssignDrawLimiter?: RateLimiter };
// 同じ教室の学生は同じ IP（学内 NAT）から来るので緩めにする：1 分に 600 回まで
const drawLimiter = (globalForDraw.__seatAssignDrawLimiter ??= new RateLimiter({ limit: 600, windowMs: 60 * 1000 }));

function lectureState(token: string): { id: number; acceptState: AcceptState } | null {
  return (
    (getDb()
      .prepare("SELECT id, accept_state AS acceptState FROM lectures WHERE public_token = ? AND archived = 0")
      .get(token) as { id: number; acceptState: AcceptState } | undefined) ?? null
  );
}

/** 受付状態と、この端末の抽選結果（あれば）を返す */
export async function checkStatusAction(token: string, deviceId: string): Promise<StudentStatus> {
  if (typeof token !== "string" || typeof deviceId !== "string") return { found: false, acceptState: null, result: null };
  const lecture = lectureState(token);
  if (!lecture) return { found: false, acceptState: null, result: null };
  const result = isValidDeviceId(deviceId) ? findDeviceDraw(getDb(), lecture.id, deviceId) : null;
  return { found: true, acceptState: lecture.acceptState, result };
}

export async function drawAction(token: string, deviceId: string): Promise<StudentStatus> {
  if (typeof token !== "string" || typeof deviceId !== "string" || !isValidDeviceId(deviceId)) {
    return { found: false, acceptState: null, result: null, error: "reload" };
  }
  if (!drawLimiter.consume(await clientIp())) {
    return { found: true, acceptState: null, result: null, error: "busy" };
  }
  const outcome = drawForDevice(getDb(), token, deviceId);
  const state = lectureState(token);
  if (outcome.ok) {
    const { drawId, seatNumber, groupName, groupColor } = outcome;
    return { found: true, acceptState: state?.acceptState ?? null, result: { drawId, seatNumber, groupName, groupColor } };
  }
  return { found: outcome.reason !== "not_found", acceptState: state?.acceptState ?? null, result: null, error: outcome.reason };
}
