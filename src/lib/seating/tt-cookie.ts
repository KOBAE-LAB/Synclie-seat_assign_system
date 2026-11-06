/** TT・参観コードを入れる Cookie（本番は __Host- 接頭辞で Secure・Path=/ を強制） */
export const TT_COOKIE = process.env.NODE_ENV === "production" ? "__Host-seat_assign_tt" : "seat_assign_tt";
