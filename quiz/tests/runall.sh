#!/bin/sh
# 全テストを走らせる。終了コードも見るので、途中で落ちたものを取りこぼさない。
#
#   cd quiz/tests && sh runall.sh
#
# 必要なもの: node, python3, playwright（chromium）
cd "$(dirname "$0")" || exit 1
TESTS_DIR=$(pwd)
QUIZ_DIR=$(cd .. && pwd)

# 静的サーバは落ちていることがある。落ちていたら自分で上げる。
# （上がっていないと全スイートが「パス0」で死に、原因が見えにくいため）
serve() {  # serve <port> <dir>
  if ! curl -sf -o /dev/null "http://localhost:$1/" 2>/dev/null; then
    (cd "$2" && exec python3 -m http.server "$1" >/dev/null 2>&1) &
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      curl -sf -o /dev/null "http://localhost:$1/" 2>/dev/null && break
      sleep 0.3
    done
  fi
}
serve 8777 "$QUIZ_DIR"
serve 8790 "$TESTS_DIR"
for p in 8777 8790; do
  curl -sf -o /dev/null "http://localhost:$p/" || { echo "サーバ $p を起動できませんでした"; exit 1; }
done

node wrap.mjs >/dev/null 2>&1
total=0; bad=0
for t in smoke.mjs audit.mjs rt.mjs notion.mjs artifact-test.mjs sync.mjs evict.mjs src.mjs fixes.mjs round2.mjs method.mjs bias.mjs progress.mjs proto.mjs due.mjs explain.mjs; do
  out=$(node "$t" 2>&1); rc=$?
  nfail=$(printf '%s' "$out" | grep -cE '^ +(FAIL|🐛)')
  npass=$(printf '%s' "$out" | grep -cE '^ +(PASS|ok )')
  total=$((total+npass))
  if [ "$rc" -eq 0 ] && [ "$nfail" -eq 0 ] && [ "$npass" -gt 0 ]; then
    printf "%-18s ✅ %s件\n" "$t" "$npass"
  else
    bad=$((bad+1))
    printf "%-18s ❌ 終了%s 失敗%s パス%s\n" "$t" "$rc" "$nfail" "$npass"
    printf '%s' "$out" | grep -E '^ +(FAIL|🐛)|Error:' | head -3 | sed 's/^/      /'
  fi
done
echo "----------------------------------------"
[ "$bad" -eq 0 ] && echo "全 $total 項目パス" || echo "⚠ $bad 個のスイートに問題"
exit $bad
