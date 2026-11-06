/**
 * 学生画面の文言（日本語／ふりがな付き／英語）。
 * ruby は「漢字(よみ)」表記で書き、画面では <ruby> で表示する。
 */
export type Lang = "ja" | "ruby" | "en";

export const LANGS: { id: Lang; label: string }[] = [
  { id: "ja", label: "日本語" },
  { id: "ruby", label: "ふりがな" },
  { id: "en", label: "English" },
];

type Text = Record<Lang, string>;

const t = (ja: string, ruby: string, en: string): Text => ({ ja, ruby, en });

export const STUDENT_TEXT = {
  yourSeatIs: t("あなたの座席は", "あなたの座席(ざせき)は", "Your seat is"),
  seatSuffix: t("番", "番(ばん)", ""),
  seatPrefix: t("", "", "No."),
  group: t("グループ", "グループ", "Group"),
  desu: t("です。", "です。", ""),
  draw: t("抽選", "抽選(ちゅうせん)", "Draw"),
  drawing: t("抽選中…", "抽選中(ちゅうせんちゅう)…", "Drawing…"),
  oncePerDevice: t(
    "1 台の端末で 1 回だけ抽選できます。",
    "1 台(だい)の端末(たんまつ)で 1 回(かい)だけ抽選(ちゅうせん)できます。",
    "You can draw only once per device.",
  ),
  loading: t("読み込み中…", "読(よ)み込(こ)み中(ちゅう)…", "Loading…"),
  notStarted: t(
    "まだ抽選の受付が始まっていません。始まると自動で「抽選」ボタンが出ます。",
    "まだ抽選(ちゅうせん)の受付(うけつけ)が始(はじ)まっていません。始(はじ)まると自動(じどう)で「抽選(ちゅうせん)」ボタンが出(で)ます。",
    "The draw has not started yet. The “Draw” button will appear automatically when it starts.",
  ),
  closed: t(
    "抽選の受付は終了しました。",
    "抽選(ちゅうせん)の受付(うけつけ)は終了(しゅうりょう)しました。",
    "The draw is closed.",
  ),
  seatMap: t("座席図", "座席図(ざせきず)", "Seat map"),
  front: t("前", "前(まえ)", "Front"),
  messageFromTeacher: t("講師から", "講師(こうし)から", "From your teacher"),
  errorReload: t("ページを再読み込みしてください。", "ページを再読(さいよ)み込(こ)みしてください。", "Please reload the page."),
  errorBusy: t(
    "混み合っています。数秒待ってからもう一度押してください。",
    "混(こ)み合(あ)っています。数秒(すうびょう)待(ま)ってからもう一度(いちど)押(お)してください。",
    "The server is busy. Please wait a few seconds and try again.",
  ),
  errorNotFound: t("この講義は見つかりません。", "この講義(こうぎ)は見(み)つかりません。", "This class was not found."),
  errorNotOpen: t(
    "いまは抽選を受け付けていません。",
    "いまは抽選(ちゅうせん)を受(う)け付(つ)けていません。",
    "The draw is not open right now.",
  ),
  errorFull: t(
    "空いている席がありません。講師に知らせてください。",
    "空(あ)いている席(せき)がありません。講師(こうし)に知(し)らせてください。",
    "No seats are left. Please tell your teacher.",
  ),
} satisfies Record<string, Text>;

export type StudentTextKey = keyof typeof STUDENT_TEXT;
export type StudentErrorCode = "reload" | "busy" | "not_found" | "not_open" | "full";

export const ERROR_TEXT_KEY: Record<StudentErrorCode, StudentTextKey> = {
  reload: "errorReload",
  busy: "errorBusy",
  not_found: "errorNotFound",
  not_open: "errorNotOpen",
  full: "errorFull",
};
