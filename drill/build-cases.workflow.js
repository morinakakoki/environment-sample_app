export const meta = {
  name: 'infra-judgment-drill-content',
  description: 'インフラ判断ドリル12ケースの問題文・選択肢・講評を作り込み、批評・改稿・横串チェックまで行う',
  phases: [
    { title: 'Draft', detail: '12ケースを1エージェント1ケースで作り込みJSON化' },
    { title: 'Critique', detail: '各ケースを厳格に批評（選択肢の質・前提変更・失点理由の分離）' },
    { title: 'Revise', detail: '批評を反映して改稿' },
    { title: 'CrossCheck', detail: '全12ケース横断で重複表現・技術的正確さ・面接回答の質を点検' },
    { title: 'Polish', detail: '横串指摘のあるケースを個別修正' },
  ],
}

// 作業ディレクトリ。リポジトリ直下で実行する場合は drill を指す。
const SCRATCH = 'drill'
const SPEC = SCRATCH + '/spec.md'

const CASES = [
  {
    id: 1, field: '障害対応', title: '月曜9時の応答遅延',
    situation: 'ALB配下のEC2で応答が30秒かかる。金曜夜にリリースがあった。上司に連絡がつかない。',
    q1: '最初の5分の優先順位', q2: '切り戻し不可（DB変更が同梱されていた）と判明', q3: '原因究明を後回しにしたことで残るリスク',
    frame: '事実確認→影響範囲→暫定対処→恒久対処',
    principle: '初動は「直す」より「広げない・知らせる」',
    answers: [1, 3, 0],
    hints: '月曜9時は業務ピークの立ち上がり。ALBのターゲット正常性、CloudWatchのTargetResponseTime/HTTPCode_ELB_5XX、リリース物の内容が事実確認の材料。切り戻し不可はDBスキーマ変更が非可逆であることに由来させる。上司不在時のエスカレーション経路（次席・当番）にも触れられる。',
  },
  {
    id: 2, field: '障害対応', title: '勝手に直ったRDS',
    situation: 'Multi-AZ構成のRDSが未明に自動フェイルオーバーした。朝には正常稼働している。原因は不明。',
    q1: '「直っているから様子見」でよいか', q2: 'これが単一AZ構成だったらどう変わるか', q3: '原因究明を省いた場合の再発リスク',
    frame: '自動復旧≠障害対応完了（復旧と原因究明の分離）',
    principle: '復旧した障害こそ、記録と原因究明を残す',
    answers: [2, 0, 3],
    hints: 'RDSイベント（Multi-AZ instance failover started/completed）、拡張モニタリング、スロークエリログ、OSレベルのメトリクスが証跡。フェイルオーバー中は数十秒〜数分の接続断があるので「無影響」とは限らない点、アプリ側の接続プールが古いエンドポイントを掴み続ける可能性、ログの保持期間が有限で証跡が消える点を使う。単一AZならフェイルオーバーではなく再起動・復旧に時間がかかり、停止時間が業務時間に食い込む。',
  },
  {
    id: 3, field: '障害対応', title: 'ディスク90%はまだ障害ではない',
    situation: '本番EC2のEBSボリュームが使用率90%。増加ペースは月+8%。ボリューム拡張は変更管理手続きで2週間かかる。現在は業務繁忙期でリリース凍結期間中である。',
    q1: '予防対応の優先度と報告の仕方', q2: '「拡張は来月でいい」と言われた場合', q3: '自己判断で古いファイルを消すことの是非',
    frame: 'リスク＝影響度×発生確率×猶予／暫定と恒久の分離',
    principle: '「まだ障害じゃない」は猶予を計算してから言う',
    answers: [0, 2, 1],
    hints: 'EBSはオンラインで拡張可能（modify volume + ファイルシステム拡張）で、技術的制約ではなく組織の変更管理手続きが2週間かかるという設定。90%から100%までの猶予日数を増加ペースから逆算するのが肝。ログローテーション、不要な古いログの退避（S3へ）、CloudWatchエージェントのディスクメトリクスとアラーム、満杯時にアプリが書き込み失敗して停止する影響を使う。消す行為は「消す前に何が消えるか特定し、退避と記録と合意を先に置く」かどうかで割れる。',
  },
  {
    id: 4, field: '障害対応', title: '自分の作業ミスかもしれない',
    situation: '本番作業（セキュリティグループの変更）の直後に監視アラートが上がった。自分の手順ミスの可能性がある。',
    q1: '即報告か、自力で静かにリカバリか', q2: '確認したらミスではなかった場合、報告は無駄だったか', q3: '隠して直した場合に失うもの',
    frame: '第一報に自責他責は関係ない／隠すコストは時間で複利',
    principle: 'ミスの報告は、早いほど安い',
    answers: [3, 1, 2],
    hints: '作業直後のアラートは相関があるとは限らない（別要因の同時発生、監視側の定期ジョブ）。CloudTrailに自分の操作が残っている、作業記録・作業前後のエビデンス、切り戻し手順の有無を使う。問2は「空振りの第一報」の価値＝報告の閾値を下げておくことの意味、および誤報が続いた場合の副作用（オオカミ少年）にも触れつつ、第一報の形式（事実・推定・確度を分けて出す）で差をつける。問3は信頼・再発防止の材料・他者の調査時間の重複といった失うものを具体化する。',
  },
  {
    id: 5, field: '基本設計', title: '99.9%と予算の板挟み',
    situation: '稼働率99.9%が要件。DBを冗長化すると予算を30%超過する。顧客からは「予算内で、でも止まるな」と言われている。',
    q1: 'どう設計判断を進めるか', q2: '「冗長化は外せ、障害なんて滅多にない」と言われた場合', q3: '予算内構成で障害が起きた際に「聞いていない」と言われないための布石',
    frame: 'SPOF特定→選択肢化（松竹梅）→決めるのは顧客、材料はSE',
    principle: 'トレードオフは選択肢と数字にして、選択の記録を残す',
    answers: [2, 1, 3],
    hints: '99.9%は年間ダウンタイム約8.76時間。単一AZ RDSは復旧に時間がかかりパッチ適用時も停止する。Multi-AZ、スナップショットからの復旧（RTO数時間）、リードレプリカ昇格などを松竹梅の材料にする。SPOFはDBだけとは限らない（単一AZのEC2、NATゲートウェイ、AZ障害）。決定の記録は議事録・設計書の前提条件欄・リスク一覧への明記。合意の署名者と日付を残す点が効く。要件定義そのものではなく、基本設計における選択肢提示と合意形成の話に留める。',
  },
  {
    id: 6, field: '基本設計', title: '「バックアップはちゃんと」',
    situation: 'RTO/RPOが未定義のまま、バックアップ方式の選定を任された。候補はスナップショット、PITR、別リージョン退避。',
    q1: '方式を選ぶ前に何を決めるか', q2: '「コストは最小で」と追加要求された場合', q3: 'リストア試験を省略した場合のリスク',
    frame: 'RTO/RPOからの逆算（未定義なら定義させる材料を作る）',
    principle: 'バックアップは取り方でなく、戻し方から設計する',
    answers: [0, 3, 2],
    hints: 'RDSの自動バックアップ+PITR（保持期間最大35日、秒単位の巻き戻し）、手動スナップショット、AWS Backupでのクロスリージョンコピー、EBSスナップショット。復旧対象は「ハード障害」だけでなく「誤削除・論理破壊」であり、後者はPITRやスナップショット世代が効く。RTOは復元にかかる実時間（スナップショットからの復元＋アプリ再接続＋整合性確認）で決まり、カタログ値ではない。リストア試験を省くと、復元手順の欠落・権限不足・KMSキーの跨ぎ問題・想定RTO超過が本番で初めて露見する。',
  },
  {
    id: 7, field: '基本設計', title: '全部Administratorでいいでしょ',
    situation: '運用チームが広いIAM権限（実質AdministratorAccess）を要求している。権限を絞ると運用が回らないと主張している。',
    q1: '権限設計の落とし所', q2: '深夜障害時に権限不足で対応できなかった過去の実績を持ち出された場合', q3: '広い権限を認めた場合に残るリスク',
    frame: '最小権限×運用実効性／例外は期限と記録付き',
    principle: '権限の例外は、期限と記録を付けて貸す',
    answers: [3, 0, 1],
    hints: '運用手順書から必要APIを洗い出す、IAM Access Analyzer/CloudTrail実績からポリシーを生成する、通常権限＋緊急時の昇格用ロール（break-glass）をAssumeRoleで用意し、MFA・時間制限・通知・CloudTrail記録を付ける、SCPやPermissions Boundaryで上限を切る、といった材料。深夜障害の実績は「権限を広げる根拠」ではなく「昇格経路を設計していなかった証拠」として読み替えられるかが勝負。残るリスクは誤操作の影響範囲、内部不正の検知困難、監査指摘、権限が既得権化して剥がせなくなること。',
  },
  {
    id: 8, field: '詳細設計', title: '現行踏襲のおかしな値',
    situation: '現行システムのDB接続プール最大値が2000で、割当メモリから見て明らかに過大である。設定理由の記録は残っていない。納期が近い。',
    q1: 'どうするか', q2: '「踏襲方針だから変えるな」と言われた場合', q3: '黙って正しい値に直すことの是非',
    frame: '踏襲は思考停止の免罪符ではない：指摘は義務、変更は合意',
    principle: 'おかしいと思ったら、直すのではなく記録に残る形で指摘する',
    answers: [1, 2, 0],
    hints: '接続プール2000に対しRDSのmax_connectionsがインスタンスクラスのメモリから算出される点、アプリサーバ台数×プール数が上限を超えると接続エラーになる点、接続あたりのメモリ消費。現行の実測接続数（Performance Insights、CloudWatchのDatabaseConnections）を取れば「過大」を数字で示せる。納期が近いので「調べ切ってから決める」も「独断で直す」も落とし穴。指摘の残し方は課題管理表・設計レビュー記録・設計書の前提条件欄。変更するかは所定の承認者の判断。',
  },
  {
    id: 9, field: '詳細設計', title: 'とりあえず80%でいい？',
    situation: 'CloudWatchアラームのしきい値を設計している。根拠になる負荷実績がまだない。',
    q1: '根拠のない設計値をどう置くか', q2: '本番稼働後に誤報が多発した場合', q3: 'しきい値を安易に緩めることのリスク',
    frame: '設計値には根拠（実測・推奨値・逆算）のどれかを付ける',
    principle: 'とりあえずの値は、根拠と見直し時期をセットで残す',
    answers: [0, 1, 3],
    hints: 'CPU使用率のしきい値だけでなく、評価期間・データポイント数・欠測時の扱い（treat missing data）、平均か最大か、といった設計要素で差をつけられる。根拠は「性能試験の実測」「類似システムの実績」「業務影響からの逆算（何%を超えると応答が劣化するか）」のいずれか。誤報多発時は、しきい値を上げるのではなく評価期間やデータポイント数、対象メトリクスの妥当性を先に見る。緩める場合は「なぜ緩めるか」「本当に検知したい事象をまだ捕まえられるか」を残す。緩和の記録がないと、次の担当者が緩和済みの値を正当な設計値と誤解する。',
  },
  {
    id: 10, field: 'テスト', title: '性能試験が目標未達',
    situation: 'リリース間近。性能試験でレスポンス目標が未達である。試験条件（同時実行数やデータ量）を緩めれば「合格」にはできる。',
    q1: 'どう報告するか', q2: '「条件を現実的な値に直しただけだ」と言われた場合', q3: '未達のままリリースする場合に満たすべき条件',
    frame: '試験は合格させるためでなく事実を測るため：事実と判断の分離',
    principle: '試験結果は曲げない。判断は材料を揃えて委ねる',
    answers: [3, 2, 0],
    hints: '未達の内訳（どの業務のどの操作が、目標何秒に対して何秒か、ピーク時かどうか）、ボトルネックの当たり（DB待ち、CPU、コネクション）、条件の妥当性の根拠（想定同時利用者数の出所）。条件変更が正当化される場合が実際にある（試験条件が過大だった根拠が別途ある場合）ので、二者択一にしない。ただし正当化するには根拠と承認と、旧条件の結果も併記して残すことが要る。未達リリースの条件は、影響業務の限定、暫定緩和策（スケールアップ、時間帯分散、監視強化）、恒久対策の期限、意思決定者の合意と記録。',
  },
  {
    id: 11, field: 'テスト', title: 'SIT期間を半分にしてくれ',
    situation: '開発の遅延のしわ寄せで、SIT期間が4週から2週に短縮される。試験項目は800件。「品質は落とすな」と言われている。',
    q1: '計画の立て直し方', q2: '「全項目やったことにすればいい」と言われた場合', q3: '削った項目から本番障害が出たとき、判断ミスと合意済みリスクの分かれ目',
    frame: 'リスクベースドテスト（業務影響度×変更度）',
    principle: '削る時は、何を削って何のリスクが残るかを合意してから削る',
    answers: [1, 0, 2],
    hints: '800件を業務影響度×変更度で層別し、必須（基幹業務・今回変更した箇所・連携I/F）と後回し（変更のない画面の再確認、低頻度業務、既存回帰の一部）に分ける。並列実行・自動化・環境の増設・要員追加といった「削らずに詰める」手も選択肢に入れる。削減案は合意先（PM、業務部門、品質保証）と記録（テスト計画変更、リスク一覧、残項目のリリース後実施計画）が必要。問3は「合意の粒度」（どの項目を削ったかが特定できる形か、単に期間短縮としか書いていないか）で分かれる。',
  },
  {
    id: 12, field: '導入設計', title: '切り戻すなら何時まで？',
    situation: 'オンプレからAWSへの切替当日。切替後に想定外の事象が発生した。業務開始まで4時間。DNSの切り戻しにも時間がかかる（TTLとキャッシュの残存）。',
    q1: 'いま判断すべきことは何か', q2: '切り戻し判断の基準を事前に決めていなかった場合', q3: '「粘って続行」を選んだ場合に捨てるもの',
    frame: '切り戻しは当日決めない：基準・期限・判断者を事前定義',
    principle: '戻る条件は、進む前に決めておく',
    answers: [2, 3, 1],
    hints: 'DNS切替はTTLを事前に短縮していなければキャッシュが残り、切り戻しても旧環境に戻り切らない時間帯が生じる。データ移行済みで新環境に更新が入り始めていると、戻す際に差分の巻き戻しが必要になり不可逆に近づく。判断すべきは「事象の切り分け」より先に「切り戻しに必要な所要時間の逆算＝デッドライン（何時までに決めれば業務開始に間に合うか）」と「判断者は誰か」。粘って続行する場合に捨てるのは、安全に戻れる時間・要員の余力・業務部門への事前通知の猶予であり、代わりに縮退運用や業務側の代替手段の準備が要る。',
  },
]

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    caseId: { type: 'number' },
    written: { type: 'boolean' },
    path: { type: 'string' },
    selfCheck: { type: 'string', description: '自己点検の結果を150字以内で。特に不安な箇所を正直に書く。' },
  },
  required: ['caseId', 'written', 'path', 'selfCheck'],
  additionalProperties: false,
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    caseId: { type: 'number' },
    verdict: { type: 'string', enum: ['pass', 'revise'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          where: { type: 'string', description: '例: questions[1].choices[2] / explain / interview[0]' },
          problem: { type: 'string' },
          fix: { type: 'string', description: '具体的な直し方。可能なら差し替え文案そのもの。' },
        },
        required: ['severity', 'where', 'problem', 'fix'],
        additionalProperties: false,
      },
    },
  },
  required: ['caseId', 'verdict', 'issues'],
  additionalProperties: false,
}

const REVISE_SCHEMA = {
  type: 'object',
  properties: {
    caseId: { type: 'number' },
    rewritten: { type: 'boolean' },
    applied: { type: 'array', items: { type: 'string' } },
    rejected: { type: 'array', items: { type: 'string' }, description: '採用しなかった指摘とその理由' },
  },
  required: ['caseId', 'rewritten', 'applied', 'rejected'],
  additionalProperties: false,
}

const CROSS_SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          caseId: { type: 'number' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          where: { type: 'string' },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['caseId', 'severity', 'where', 'problem', 'fix'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string' },
  },
  required: ['issues', 'summary'],
  additionalProperties: false,
}

const ANSWER_LETTERS = ['A', 'B', 'C', 'D']

function draftPrompt(c) {
  const p = SCRATCH + '/cases/case' + String(c.id).padStart(2, '0') + '.json'
  return [
    'あなたはIPA高度試験の午後Ⅰ事例問題を長年作問してきた出題者であり、同時にAWS基盤の設計・運用を10年以上経験したインフラエンジニアである。',
    '',
    '【最初に必ずやること】次のファイルを Read で全文読み、共通仕様を厳守すること: ' + SPEC,
    '',
    '【担当ケース】',
    '- 通し番号(id): ' + c.id,
    '- 分野(field): ' + c.field,
    '- タイトル(title): ' + c.title + '  ← 一字も変更禁止',
    '- 状況の骨子: ' + c.situation,
    '- 問1で試す判断: ' + c.q1,
    '- 問2で変える前提: ' + c.q2,
    '- 問3で問うこと: ' + c.q3,
    '- 判断フレーム(frame.name): ' + c.frame + '  ← 一字も変更禁止',
    '- 今日の判断原則(principle): ' + c.principle + '  ← 一字も変更禁止',
    '',
    '【正解位置の指定（厳守）】',
    '問1の正解 = ' + ANSWER_LETTERS[c.answers[0]] + '（answer: ' + c.answers[0] + '）',
    '問2の正解 = ' + ANSWER_LETTERS[c.answers[1]] + '（answer: ' + c.answers[1] + '）',
    '問3の正解 = ' + ANSWER_LETTERS[c.answers[2]] + '（answer: ' + c.answers[2] + '）',
    'この位置に正解が来るよう選択肢を並べること。全12ケースで正解記号を均等分散させるための指定なので、勝手に変えない。',
    '',
    '【題材の手がかり（使えるものを選んで使う。全部詰め込まない）】',
    c.hints,
    '',
    '【品質の要求水準】',
    '- 4択のうち3つは「実務で先輩が実際に口にしそうな、それなりに筋の通った案」にすること。読んだ瞬間に消せる選択肢を作ったら失格。',
    '- 不正解3つの失点理由を「優先順位」「前提」「手続き」で必ず書き分けること。3つが同じ理由で落ちる問題は作り直す。',
    '- 正解にも代償（時間・コスト・誰かの反発・捨てるもの）を必ず含めること。',
    '- 問2は前提を1つだけ変え、問1の正解をそのまま繰り返す選択肢が「もっともらしいが劣る」形になるよう設計すること。',
    '- 技術的な記述はAWSの実仕様に忠実に。曖昧な場合は断定を避けた書き方にする。',
    '- 面接3行回答例は、声に出して読んで不自然でないこと。書き言葉の要約にしない。',
    '',
    '【出力】',
    '完成したJSONを Write ツールで次のパスに書き出す（そのファイルにはJSONだけを入れる。コードフェンス禁止、コメント禁止、プレースホルダ禁止）:',
    p,
    '書き出したら、必ず Read で読み返して、JSONとして壊れていないこと・全項目が埋まっていること・answerの位置が指定通りであること・othersが正解以外の3indexを昇順で持っていることを自分で確認すること。',
    '最後に、指定スキーマの構造化出力を返す。path には上記パスを入れる。',
  ].join('\n')
}

function critiquePrompt(c) {
  const p = SCRATCH + '/cases/case' + String(c.id).padStart(2, '0') + '.json'
  return [
    'あなたは作問の査読者である。甘い査読は害悪であり、通すことではなく穴を見つけることが仕事である。',
    '',
    '次の2ファイルを Read で読むこと:',
    '1. 共通仕様: ' + SPEC,
    '2. 査読対象: ' + p,
    '',
    '【査読観点（各問1〜3すべてについて機械的に潰す）】',
    'A. 消去法で解けないか：4択のうち、読んだ瞬間に「これは違う」と分かる選択肢はないか。断定語・極端さ・明らかな怠慢・非現実的な手順で見破れる選択肢は不合格。',
    'B. 正解が一意か：正解とされた選択肢と同等以上に妥当な選択肢が他にないか。逆に、実務家が見て「正解の方が筋が悪い」と反論できないか。反論できるなら不合格。',
    'C. 失点理由の分離：不正解3つが「優先順位」「前提」「手続き」で書き分けられているか。2つ以上が同じ理由で落ちるなら不合格。',
    'D. 問2が本当に前提を1つだけ変え、かつ判断が変わっているか。問1の正解を機械的に繰り返せば正解になるなら不合格。',
    'E. 問3が「捨てたもの・残るリスク」を問えているか。単なる知識問題や一般論に落ちていないか。',
    'F. 技術的正確さ：AWSの実仕様と矛盾する記述はないか（RDSのフェイルオーバー挙動、EBSのオンライン拡張、PITRの保持期間、ALBのヘルスチェック、CloudWatchの評価期間、IAMの昇格経路など）。',
    'G. 出題範囲：要件定義のヒアリング手法そのもの、契約・見積、アプリのコード実装に踏み込んでいないか。',
    'H. 講評の質：othersの各文が「なぜこの場面では順位が下がるか」を具体的に説明しているか。「不適切である」で終わる説明は不合格。',
    'I. 面接3行回答例：ちょうど3行か。声に出して自然か。1行目=状況、2行目=判断と根拠、3行目=結果と学び、になっているか。',
    'J. 形式：answerが指定位置（問1=' + c.answers[0] + ', 問2=' + c.answers[1] + ', 問3=' + c.answers[2] + '）か。titleとframe.nameとprincipleが指定文言と一字一句同じか。JSONとして妥当か。文字数が仕様の範囲か。',
    '',
    '指摘は「どこが」「なぜ問題か」「どう直すか（可能なら差し替え文案そのもの）」まで書く。抽象的な感想は書かない。',
    '問題がなければ verdict=pass、1つでもmedium以上の問題があれば verdict=revise とする。',
    '甘く見積もらないこと。実際、初稿には必ず1つ以上の穴がある。',
  ].join('\n')
}

function revisePrompt(c, critique) {
  const p = SCRATCH + '/cases/case' + String(c.id).padStart(2, '0') + '.json'
  return [
    'あなたは作問者本人として、査読指摘を反映して原稿を改稿する。',
    '',
    '読むファイル:',
    '1. 共通仕様: ' + SPEC,
    '2. 改稿対象: ' + p,
    '',
    '【査読指摘（JSON）】',
    JSON.stringify(critique, null, 1),
    '',
    '【改稿方針】',
    '- high/medium の指摘は原則すべて反映する。反論があるものだけ rejected に理由付きで書く。',
    '- 指摘を直した結果、他の選択肢との整合が崩れていないか必ず見直す。1つの選択肢を直したら4つ全部を読み直す。',
    '- answerの位置は絶対に動かさない（問1=' + c.answers[0] + ', 問2=' + c.answers[1] + ', 問3=' + c.answers[2] + '）。選択肢を差し替える場合も、正解はこの位置に置いたままにする。',
    '- title / frame.name / principle は一字も変更しない。',
    '- 指摘がなかった箇所でも、自分で読み返して「消去法で解ける」「正解が一意でない」と気づいたら直す。',
    '',
    '改稿後のJSON全文を Write で同じパス（' + p + '）に上書きする。JSONのみ。プレースホルダ禁止。',
    '書き出したら Read で読み返し、JSONとして妥当・全項目充足・answer位置・others昇順3件を確認すること。',
  ].join('\n')
}

phase('Draft')
log('12ケースの作り込みを開始（作り込み→査読→改稿を1ケースずつ独立に流す）')

const perCase = await pipeline(
  CASES,
  (c) => agent(draftPrompt(c), { label: 'draft:' + c.id + ' ' + c.title, phase: 'Draft', schema: DRAFT_SCHEMA }),
  (_draft, c) => agent(critiquePrompt(c), { label: 'critique:' + c.id + ' ' + c.title, phase: 'Critique', schema: CRITIQUE_SCHEMA, effort: 'high' }),
  (crit, c) => {
    if (!crit || crit.verdict === 'pass' && (!crit.issues || crit.issues.filter(i => i.severity !== 'low').length === 0)) {
      return { caseId: c.id, rewritten: false, applied: [], rejected: ['査読でmedium以上の指摘なし'] }
    }
    return agent(revisePrompt(c, crit), { label: 'revise:' + c.id + ' ' + c.title, phase: 'Revise', schema: REVISE_SCHEMA })
  }
)

log('全12ケースの改稿完了。横串チェックに入る。')

phase('CrossCheck')

const ALL_PATHS = CASES.map(c => SCRATCH + '/cases/case' + String(c.id).padStart(2, '0') + '.json').join('\n')

const LENSES = [
  {
    key: 'dup',
    prompt: [
      'あなたは編集者である。全12ケースを通読し、「同じドリルの中で読んでいて飽きる／使い回しに見える」箇所を洗い出す。',
      '観点：(1) 複数ケースでほぼ同じ言い回しの選択肢・解説文がないか（特に「関係者に第一報を入れる」「記録に残す」「合意を取る」系の常套句）。(2) 同じ失点パターンばかりが正解／不正解になっていないか。(3) 面接3行回答例が金太郎飴になっていないか。(4) 状況文の書き出しが似通っていないか。',
      '重複を見つけたら、どちらのケースをどう書き換えるべきか、差し替え文案まで具体的に示す。',
    ].join('\n'),
  },
  {
    key: 'tech',
    prompt: [
      'あなたはAWSソリューションアーキテクトである。全12ケースを通読し、技術的に不正確・誤解を招く記述を洗い出す。',
      '観点：RDS Multi-AZの挙動とフェイルオーバー時間、自動バックアップとPITRの保持期間、EBSのオンライン拡張とファイルシステム拡張、ALBのヘルスチェックとターゲット切り離し、CloudWatchメトリクスの粒度・評価期間・欠測値の扱い、IAMの権限昇格経路とCloudTrailの記録、DNSのTTLとキャッシュ、CloudFormationの変更適用、RDSのmax_connectionsとインスタンスクラスの関係。',
      '「実際にはそうならない」「そのAWSサービスではその操作はできない／不要」といった記述は必ず指摘する。断定を避ければ済むものと、設定自体を変えるべきものを区別して指摘する。',
    ].join('\n'),
  },
  {
    key: 'interview',
    prompt: [
      'あなたはSIerの中途採用面接官であり、同時にキャリア面談のコーチである。全12ケースの interview（面接3行回答例）と principle、frame.howto を通読する。',
      '観点：(1) その3行を面接で言われたとき、面接官として「この人は判断できる」と感じるか。感じないならどこが弱いか。(2) 声に出して読んで自然な話し言葉か（書き言葉の圧縮になっていないか）。(3) 3行の役割分担（状況／判断と根拠／結果と学び）が守られているか。(4) 実際には経験していない工程（要件定義・顧客折衝・アプリ開発）を経験したかのように語ってしまっていないか。これは経歴詐称につながるので最重要で潰す。(5) frame.howto が、そのフレーム名の適用手順として実際に使える具体性を持っているか。',
      '弱い行は、差し替え文案をそのまま書いて示す。',
    ].join('\n'),
  },
]

const crossResults = await parallel(LENSES.map(l => () => agent([
  l.prompt,
  '',
  '共通仕様（先に読むこと）: ' + SPEC,
  '',
  '次の12ファイルをすべて Read で読むこと:',
  ALL_PATHS,
  '',
  'ファイルは書き換えない。指摘だけを構造化出力で返す。指摘には必ず caseId と where（例: questions[1].choices[2]）を付ける。',
  '問題がない場合は issues を空配列にしてよいが、通読すれば必ず何かしら改善余地はあるはずなので、安易に空にしない。',
].join('\n'), { label: 'cross:' + l.key, phase: 'CrossCheck', schema: CROSS_SCHEMA, effort: 'high' })))

const crossIssues = crossResults.filter(Boolean).flatMap(r => r.issues || [])
log('横串指摘 ' + crossIssues.length + ' 件')

const byCase = new Map()
for (const iss of crossIssues) {
  if (!byCase.has(iss.caseId)) byCase.set(iss.caseId, [])
  byCase.get(iss.caseId).push(iss)
}

phase('Polish')

const targets = CASES.filter(c => (byCase.get(c.id) || []).some(i => i.severity !== 'low'))
log('個別修正の対象: ' + (targets.length ? targets.map(c => c.id).join(', ') : 'なし'))

const polished = await parallel(targets.map(c => () => agent([
  'あなたは作問者本人である。全12ケースを横断査読した結果、担当ケース ' + c.id + '「' + c.title + '」に次の指摘が付いた。反映して原稿を仕上げる。',
  '',
  '読むファイル:',
  '1. 共通仕様: ' + SPEC,
  '2. 修正対象: ' + SCRATCH + '/cases/case' + String(c.id).padStart(2, '0') + '.json',
  '',
  '【指摘】',
  JSON.stringify(byCase.get(c.id), null, 1),
  '',
  '【制約】',
  '- answerの位置は動かさない（問1=' + c.answers[0] + ', 問2=' + c.answers[1] + ', 問3=' + c.answers[2] + '）。',
  '- title / frame.name / principle は一字も変更しない。',
  '- 面接3行回答例に「未経験の工程を経験したように語る」表現があれば最優先で書き換える。',
  '- 指摘を直した結果、選択肢間の整合が崩れていないか4択すべて読み直す。',
  '',
  '修正後のJSON全文を Write で同じパスに上書きし、Read で読み返して妥当性を確認する。',
].join('\n'), { label: 'polish:' + c.id + ' ' + c.title, phase: 'Polish', schema: REVISE_SCHEMA })))

return {
  drafted: CASES.length,
  revised: perCase.filter(Boolean).filter(r => r.rewritten).length,
  crossIssueCount: crossIssues.length,
  polishedCases: polished.filter(Boolean).map(r => r.caseId),
  crossSummaries: crossResults.filter(Boolean).map(r => r.summary),
}
