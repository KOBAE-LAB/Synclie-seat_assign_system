/**
 * スキーマのマイグレーション定義。
 * 適用済みバージョンは SQLite の `PRAGMA user_version` で管理する。
 * 既存の要素は書き換えず、変更は必ず新しいバージョンを末尾に追加すること。
 */
export type Migration = {
  version: number;
  name: string;
  sql: string;
};

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    sql: /* sql */ `
      -- 教員アカウント（メールアドレスは持たない）
      CREATE TABLE teachers (
        id                  INTEGER PRIMARY KEY,
        login_id            TEXT    NOT NULL UNIQUE
                              CHECK (length(login_id) BETWEEN 3 AND 40
                                     AND login_id NOT GLOB '*[^A-Za-z0-9_-]*'),
        password_hash       TEXT    NOT NULL,
        recovery_code_hash  TEXT    NOT NULL,
        failed_login_count  INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
        locked_until        TEXT,
        last_login_at       TEXT,
        created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      -- 2 年間未使用アカウントの自動削除用
      CREATE INDEX idx_teachers_last_login_at ON teachers (last_login_at);

      -- 教室（再利用可能なレイアウト）
      -- layout_json: { desks: [...], fixtures: [...], seats: [{ number, x, y, ... }] }
      CREATE TABLE classrooms (
        id                INTEGER PRIMARY KEY,
        owner_teacher_id  INTEGER NOT NULL REFERENCES teachers (id) ON DELETE CASCADE,
        name              TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
        layout_json       TEXT    NOT NULL DEFAULT '{"desks":[],"fixtures":[],"seats":[]}'
                            CHECK (json_valid(layout_json)),
        share_code        TEXT    UNIQUE,
        created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE INDEX idx_classrooms_owner ON classrooms (owner_teacher_id);

      -- 講義（教室を選んで抽選を行う単位）
      -- message_furigana は「漢字(よみ)」表記のテキスト
      CREATE TABLE lectures (
        id                INTEGER PRIMARY KEY,
        owner_teacher_id  INTEGER NOT NULL REFERENCES teachers (id) ON DELETE CASCADE,
        classroom_id      INTEGER NOT NULL REFERENCES classrooms (id),
        name              TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
        lecture_date      TEXT,
        enrolled_count    INTEGER NOT NULL DEFAULT 0 CHECK (enrolled_count BETWEEN 0 AND 150),
        message_ja        TEXT    NOT NULL DEFAULT '',
        message_furigana  TEXT    NOT NULL DEFAULT '',
        message_en        TEXT    NOT NULL DEFAULT '',
        memo              TEXT    NOT NULL DEFAULT '',
        folder            TEXT    NOT NULL DEFAULT '',
        tags_json         TEXT    NOT NULL DEFAULT '[]'
                            CHECK (json_valid(tags_json) AND json_type(tags_json) = 'array'),
        archived          INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
        accept_state      TEXT    NOT NULL DEFAULT 'before'
                            CHECK (accept_state IN ('before', 'open', 'closed')),
        public_token      TEXT    NOT NULL UNIQUE,
        tt_code           TEXT    UNIQUE,
        created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE INDEX idx_lectures_owner ON lectures (owner_teacher_id, archived);
      CREATE INDEX idx_lectures_classroom ON lectures (classroom_id);

      -- 講義ごとのグループ
      CREATE TABLE lecture_groups (
        id          INTEGER PRIMARY KEY,
        lecture_id  INTEGER NOT NULL REFERENCES lectures (id) ON DELETE CASCADE,
        name        TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
        color       TEXT    NOT NULL DEFAULT '#800b16',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        UNIQUE (lecture_id, id)
      ) STRICT;

      CREATE INDEX idx_lecture_groups_lecture ON lecture_groups (lecture_id, sort_order);

      -- 講義ごとの座席（使用 / 予備）
      CREATE TABLE lecture_seats (
        id           INTEGER PRIMARY KEY,
        lecture_id   INTEGER NOT NULL REFERENCES lectures (id) ON DELETE CASCADE,
        seat_number  INTEGER NOT NULL CHECK (seat_number > 0),
        group_id     INTEGER,
        status       TEXT    NOT NULL DEFAULT 'used' CHECK (status IN ('used', 'spare')),
        UNIQUE (lecture_id, seat_number),
        UNIQUE (lecture_id, id),
        -- グループは同じ講義のものに限る
        FOREIGN KEY (lecture_id, group_id) REFERENCES lecture_groups (lecture_id, id)
      ) STRICT;

      -- 抽選結果。学生は匿名の端末 ID のみで識別する（代理抽選は device_id が NULL）。
      CREATE TABLE draws (
        id            INTEGER PRIMARY KEY,
        lecture_id    INTEGER NOT NULL REFERENCES lectures (id) ON DELETE CASCADE,
        seat_id       INTEGER NOT NULL,
        device_id     TEXT,
        drawn_by      TEXT    NOT NULL DEFAULT 'student' CHECK (drawn_by IN ('student', 'proxy')),
        cancelled     INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0, 1)),
        created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        cancelled_at  TEXT,
        CHECK (drawn_by = 'proxy' OR device_id IS NOT NULL),
        -- 座席は同じ講義のものに限る
        FOREIGN KEY (lecture_id, seat_id) REFERENCES lecture_seats (lecture_id, id) ON DELETE CASCADE
      ) STRICT;

      -- 同じ座席を二重に割り当てない（取消済みは除く）
      CREATE UNIQUE INDEX uq_draws_active_seat
        ON draws (lecture_id, seat_id) WHERE cancelled = 0;

      -- 1 端末につき 1 講義 1 座席（取消済みは除く）
      CREATE UNIQUE INDEX uq_draws_active_device
        ON draws (lecture_id, device_id) WHERE cancelled = 0 AND device_id IS NOT NULL;

      CREATE INDEX idx_draws_lecture ON draws (lecture_id, cancelled);
    `,
  },
  {
    version: 2,
    name: "teacher_sessions",
    sql: /* sql */ `
      -- 教員のログインセッション。Cookie には乱数トークンを入れ、
      -- DB には SESSION_SECRET による HMAC-SHA256 のみを保存する。
      CREATE TABLE teacher_sessions (
        id            INTEGER PRIMARY KEY,
        token_hash    TEXT    NOT NULL UNIQUE,
        teacher_id    INTEGER NOT NULL REFERENCES teachers (id) ON DELETE CASCADE,
        created_at    TEXT    NOT NULL,
        last_seen_at  TEXT    NOT NULL,
        expires_at    TEXT    NOT NULL
      ) STRICT;

      CREATE INDEX idx_teacher_sessions_teacher ON teacher_sessions (teacher_id);
      CREATE INDEX idx_teacher_sessions_expires ON teacher_sessions (expires_at);

      -- ログイン ID は大文字・小文字を区別せず一意にする
      CREATE UNIQUE INDEX uq_teachers_login_id_nocase ON teachers (login_id COLLATE NOCASE);
    `,
  },
];
