import { parseRuby } from "@/lib/i18n/ruby";

/** 「漢字(よみ)」表記の文字列を <ruby> で表示する。showRuby=false ならふりがなを外して表示 */
export function Ruby({ text, showRuby = true }: { text: string; showRuby?: boolean }) {
  return (
    <>
      {parseRuby(text).map((seg, i) =>
        seg.ruby && showRuby ? (
          <ruby key={i}>
            {seg.text}
            <rp>(</rp>
            <rt>{seg.ruby}</rt>
            <rp>)</rp>
          </ruby>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}
