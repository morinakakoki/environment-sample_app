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

    # </script> で早期終了させられないようエスケープ（値そのものは変わらない）
    payload = json.dumps(bank, ensure_ascii=False, indent=2)
    payload = payload.replace("</", "<\\/")

    html = html[:i] + START + "\nconst BANK = " + payload + ";\n" + html[j:]
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
