#!/usr/bin/env python3
"""interview-question-bank.json を index.html に埋め込む。

    python3 embed-bank.py path/to/interview-question-bank.json

index.html 内の `const BANK = {...};` ブロックだけを差し替える。
質問文・ID・カテゴリは JSON の値をそのまま（ensure_ascii=False）書き出すので、
一字も変わらない。埋め込みに成功すると __sample__ が消え、
アプリ上部の「サンプルデータで動作中」バナーも自動的に出なくなる。
"""
import io, json, re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, "index.html")

START = "/* BANK:START */"
END = "/* BANK:END */"


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python3 embed-bank.py <interview-question-bank.json>")
    src = sys.argv[1]

    with io.open(src, encoding="utf-8") as f:
        bank = json.load(f)
    if not isinstance(bank, dict):
        sys.exit("error: JSON のトップレベルはオブジェクトである必要があります")

    # サンプル判定フラグは本番データには残さない
    bank.pop("__sample__", None)

    with io.open(HTML, encoding="utf-8") as f:
        html = f.read()

    try:
        i = html.index(START)
        j = html.index(END, i)
    except ValueError:
        sys.exit("error: index.html に BANK:START / BANK:END の目印が見つかりません")

    payload = json.dumps(bank, ensure_ascii=False, indent=2)

    # script コンテキストを壊す文字を JSON エスケープに置き換える。
    # < > & / は JSON の構文には現れず文字列値の中にしか出ないので、
    # 全体を一括置換してよい。\u003c などはデコードすると元の文字に戻るため、
    # 質問文・ID・カテゴリの「値」は一字も変わらない。
    #
    # これで防げるもの:
    #   </script>      … script 要素の早期終了
    #   <!--  <!--<script>  … HTML風コメントによる script data double escaped 状態
    #   /* BANK:END */ … 埋め込みマーカーの偽装（再埋め込み時に任意JSが実行される）
    for ch, esc in (("<", "\\u003c"), (">", "\\u003e"), ("&", "\\u0026"), ("/", "\\/")):
        payload = payload.replace(ch, esc)
    # U+2028 / U+2029 は古い JS エンジンで行終端子として扱われる
    payload = payload.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

    html = html[:i] + START + "\nconst BANK = " + payload + ";\n" + html[j:]

    # 埋め込み後にマーカーが1組だけであることを確認する。
    # ここが2組以上なら、データ側にマーカーが紛れ込んでいる＝次回の埋め込みが
    # 壊れるということなので、書き込まずに中止する。
    if html.count(START) != 1 or html.count(END) != 1:
        sys.exit("error: 埋め込み後のマーカーが一意ではありません（START=%d, END=%d）。"
                 "書き込みを中止しました。" % (html.count(START), html.count(END)))

    # 書き出したものが元の JSON と完全に一致することを検証する
    try:
        check = json.loads(payload)
    except ValueError as e:
        sys.exit("error: 生成した JSON を読み直せませんでした: %s" % e)
    if check != bank:
        sys.exit("error: エスケープ処理で内容が変化しました。書き込みを中止しました。")

    with io.open(HTML, "w", encoding="utf-8") as f:
        f.write(html)

    qs = bank.get("questions") or bank.get("items") or []
    cats = bank.get("categories") or []
    meta = bank.get("meta") or {}
    print("埋め込み完了: %s" % HTML)
    print("  質問 %d問 / カテゴリ %d件" % (len(qs), len(cats)))
    print("  deepDiveCategories: %s" % (meta.get("deepDiveCategories") or "(なし)"))
    print("  checkCriteria: %d項目" % len(meta.get("checkCriteria") or []))
    print("  logFormat: %s" % (meta.get("logFormat") or "(なし — 既定の5列を使います)"))


if __name__ == "__main__":
    main()
