/* デモ2：工程FMEAドラフト生成
   起点は必ず「工程」。工程 → 機能 → 要求事項 → 逸脱 → 故障モードの連鎖を画面上で追跡できるようにする。
   影響・原因・予防・検出は既存の工程FMEA行から引き当て、出典を示す。引き当てできない場合は推定と明示する。 */

const PROC_BY_NO = {};
DATA.PROCESSES.forEach(p => PROC_BY_NO[p.no] = p);
const TR_BY_ID = {};
DATA.TROUBLES.forEach(t => TR_BY_ID[t.id] = t);
const procLabel = no => PROC_BY_NO[no] ? `工程${no} ${PROC_BY_NO[no].name}` : `工程${no}`;

/* ---- 類似度（2-gram Dice） ---- */
function norm(s) {
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[\s・,.、。（）()「」【】\/：:；;＋+\-–—]/g, '');
}
function grams(s) {
  const t = norm(s), set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}
function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach(g => { if (b.has(g)) inter++; });
  return (2 * inter) / (a.size + b.size);
}

/* ---- 逸脱の型 → 故障モード文 ---- */
const MODE_TPL = {
  '未実施': s => `${s}が未実施となる`,
  '欠落': s => `${s}が欠落する`,
  '一部未実施': s => `${s}が一部未実施となる`,
  '不足': s => `${s}が不足する`,
  '過剰': s => `${s}が過剰になる`,
  'ばらつき': s => `${s}がばらつき、規格を外れる`,
  '位置違い': s => `${s}が指定位置から外れる`,
  '方向違い': s => `${s}の向きが指定と異なる`,
  '順序違い': s => `${s}の順序を誤る`,
  '条件違い': s => `${s}が規定条件を外れる`,
  '部品違い': s => `指定と異なる${s}を使用する`,
  '形状違い': s => `${s}の形状が規格を外れる`,
  '変形': s => `${s}が変形する`,
  '破損': s => `${s}が破損する`,
  'ねじれ': s => `${s}にねじれが生じる`,
  '汚れ': s => `${s}に汚れが付着する`,
  '異物付着': s => `${s}に異物が付着する`,
  '誤判定': s => `${s}の判定を誤る`,
  '検査漏れ': s => `${s}の確認が漏れる`
};
const modeText = (subj, dev) => (MODE_TPL[dev] || (s => `${s}が規格を外れる`))(subj);

/* ---- S/O/Dの基準ラベル ---- */
function critLabel(kind, v) {
  const row = DATA.SOD_CRITERIA[kind].find(r => v >= r.v[0] && v <= r.v[1]);
  return row ? row.label : '該当区分なし';
}

/* 参照範囲。外した文書は要求事項の抽出元から除き、引き当ても止める。
   「どの文書が何に効いているか」を画面で確かめられるようにする。 */
function refScope() {
  return {
    flow: $('#rfFlow').checked, dwg: $('#rfDwg').checked, wi: $('#rfWi').checked,
    fmea: $('#rfFmea').checked, tr: $('#rfTr').checked
  };
}
function reqsInScope(proc) {
  const s = refScope();
  return (DATA.PROC_REQS[proc] || []).filter(r => {
    if (r.src.startsWith('図面') || r.src.startsWith('条件表')) return s.dwg;
    if (r.src.startsWith('作業要領書') || r.src.startsWith('検査基準書')) return s.wi;
    return true;
  });
}

/* ---- 生成本体 ---- */
function deriveRows(proc) {
  const scope = refScope();
  const reqs = reqsInScope(proc);
  const existing = DATA.PFMEA.filter(r => r.proc === proc);
  const rows = [];

  reqs.forEach((rq, ri) => {
    // 故障モード文は逸脱の型のテンプレートから作る。
    // 現場の言い方が定まっている場合だけ rq.modes で上書きする（型は画面にそのまま出すので連鎖は崩れない）。
    const entries = (rq.devs || []).map(d =>
      ({ dev: d, mode: (rq.modes && rq.modes[d]) || modeText(rq.subj, d) }));
    entries.forEach(({ dev, mode }, di) => {
      const g = grams(mode + ' ' + rq.subj);

      // 同工程の既存FMEAに同義の行があるか
      let covered = null, cs = 0;
      existing.forEach(r => {
        const s = dice(g, grams(r.mode));
        if (s > cs) { cs = s; covered = r; }
      });
      const isCovered = cs >= 0.42;

      // 影響・原因・予防・検出の引き当て元（同工程優先、なければ全工程から）
      // 既存の工程FMEAを参照範囲から外した場合は引き当てない（S/O/Dが未評価になる）
      let basis = (isCovered && scope.fmea) ? covered : null, bs = isCovered ? cs : 0;
      if (!basis && scope.fmea) {
        DATA.PFMEA.forEach(r => {
          let s = dice(g, grams(r.mode + ' ' + r.cause));
          if (r.proc === proc) s += 0.12;
          if (s > bs) { bs = s; basis = r; }
        });
        if (bs < 0.20) basis = null;
      }

      const sameProcBasis = basis && basis.proc === proc;
      rows.push({
        key: `${proc}-${ri}-${di}`,
        proc, req: rq, dev, mode,
        eff: basis ? basis.eff : '要求事項を満たせないことによる影響を特定できていません',
        cause: basis ? basis.cause : '',
        prev: basis ? basis.prev : '',
        det: basis ? basis.det : '',
        s: basis ? basis.s : null, o: basis ? basis.o : null, d: basis ? basis.d : null,
        basis, bs, sameProcBasis, isCovered,
        state: isCovered ? 'covered' : 'new'
      });
    });
  });
  return rows;
}

/* 既存FMEA行の故障モード文から逸脱の型を推定する（具体的な語を先に判定する） */
const DEV_HINTS = [
  ['本数不足', '欠落'], ['欠落', '欠落'], ['同梱漏れ', '欠落'],
  ['順序', '順序違い'], ['向き', '方向違い'], ['方向', '方向違い'],
  ['芯ずれ', '位置違い'], ['位置', '位置違い'], ['段差', '位置違い'],
  ['異機種', '部品違い'], ['異種', '部品違い'], ['品番', '部品違い'], ['誤使用', '部品違い'],
  ['打痕', '破損'], ['割れ', '破損'], ['クラック', '破損'], ['破損', '破損'],
  ['損傷', '破損'], ['かみ込み', '破損'], ['クラックが発生', '破損'],
  ['ソリ', '変形'], ['変形', '変形'], ['ヒケ', '形状違い'], ['形状', '形状違い'],
  ['はんだボール', '異物付着'], ['バリ', '異物付着'], ['異物', '異物付着'], ['付着', '異物付着'],
  ['判定が', '誤判定'], ['判定を', '誤判定'], ['誤判定', '誤判定'],
  ['基準値', '条件違い'], ['校正切れ', '検査漏れ'], ['確認が漏れ', '検査漏れ'], ['検査漏れ', '検査漏れ'],
  ['プロファイル', '条件違い'], ['温度', '条件違い'], ['条件', '条件違い'],
  ['半嵌合', '一部未実施'], ['一部', '一部未実施'],
  ['ばらつき', 'ばらつき'], ['超過', '過剰'], ['過多', '過剰'], ['過剰', '過剰'],
  ['不足', '不足'], ['規格外', 'ばらつき'], ['上限', '過剰'], ['下限', '不足']
];
function inferDev(text) {
  const t = String(text || '');
  for (const [k, d] of DEV_HINTS) if (t.includes(k)) return d;
  return null;
}

/* 抜け漏れ候補
   「他工程では登録されている逸脱の型が、本工程でも成立し得るのに未登録」を探す。
   文章の類似ではなく逸脱の型で判定するため、工程をまたいだ観点の抜けを拾える。
   （先方の「その工程の不具合が、その工程にしか入らない」という課題に対応する考え方） */
function gapCandidates(proc, rows) {
  if (!refScope().tr && !refScope().fmea) return [];
  const reqs = reqsInScope(proc);
  // 本工程の要求事項に対して成立し得る逸脱の型
  const plausible = new Map();
  reqs.forEach(rq => (rq.devs || []).forEach(d => { if (!plausible.has(d)) plausible.set(d, rq); }));
  // 本工程で既にカバーされている型（既存FMEA行＋今回生成して登録済み判定になった行）
  const covered = new Set();
  DATA.PFMEA.filter(r => r.proc === proc).forEach(r => {
    const d = inferDev(r.mode);
    if (d) covered.add(d);
  });
  rows.forEach(r => { if (r.state === 'covered') covered.add(r.dev); });

  // 型ごとに、他工程の登録行のうち最も影響度が高いものを代表として出す
  const best = new Map();
  DATA.PFMEA.filter(r => r.proc !== proc).forEach(r => {
    const d = inferDev(r.mode);
    if (!d || !plausible.has(d) || covered.has(d)) return;
    const cur = best.get(d);
    if (!cur || r.s > cur.rec.s) best.set(d, { rec: r, dev: d, relReq: plausible.get(d) });
  });
  return Array.from(best.values()).sort((a, b) => b.rec.s - a.rec.s).slice(0, 4);
}

/* ---- 状態 ---- */
let curProc = '', curRows = [], curGaps = [], draft = [];

/* ---- 描画 ---- */
function sodCell(r) {
  if (r.s == null) {
    return `<span class="status status--todo">未評価</span>
      <div class="cell-sub">評価の根拠となる類似行がありません</div>`;
  }
  return `<span class="sod-badge${r.s >= 8 ? ' sod-badge--hi' : ''}">S${r.s}</span>
    <span class="sod-badge">O${r.o}</span>
    <span class="sod-badge">D${r.d}</span>
    <div class="cell-sub">AI候補・要確認</div>`;
}

function renderResult() {
  const p = PROC_BY_NO[curProc];
  const reqs = reqsInScope(curProc);
  const newRows = curRows.filter(r => r.state === 'new');
  const coveredRows = curRows.filter(r => r.state === 'covered');
  const docs = Array.from(new Set(reqs.map(r => r.src)));
  const trs = DATA.TROUBLES.filter(t => t.proc === curProc);
  const aiReqs = reqs.filter(r => r.conf === 'ai');
  const wide = document.querySelector('input[name="genMode"]:checked').value === 'wide';

  const summary = `
    <div class="card" style="border-left:4px solid var(--color-primary)">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
        <span class="status status--done">生成完了</span>
        <span class="cell-sub">対象工程 ${esc(procLabel(curProc))}　／　生成 ${today()}</span>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--space-4);margin-bottom:var(--space-4)">
        <div><p class="kpi__label">整理した機能</p><p class="kpi__value" style="font-size:var(--font-section-title)">1<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">抽出した要求事項</p><p class="kpi__value" style="font-size:var(--font-section-title)">${reqs.length}<span class="kpi__unit"> 件</span></p><p class="kpi__note">参照文書 ${docs.length} 件</p></div>
        <div><p class="kpi__label">生成した故障モード</p><p class="kpi__value" style="font-size:var(--font-section-title)">${newRows.length}<span class="kpi__unit"> 件</span></p><p class="kpi__note">既に登録済み ${coveredRows.length} 件</p></div>
      </div>
      <p style="line-height:var(--line-height-body)">
        ${esc(procLabel(curProc))}について、工程フローから機能を整理し、${esc(docs.join('・'))}から要求事項を抽出しました。
        要求事項を満たせない状態を逸脱として展開し、工程FMEAの故障モード候補を生成しています。
        ${aiReqs.length ? `うち ${aiReqs.length} 件の要求事項は資料に明記がなく、AIによる推定です。` : ''}
      </p>
    </div>`;

  const funcSec = `
    <div class="section">
      <h2 class="section__title">① 工程フローから機能・作業を整理</h2>
      <p class="section__lead">工程が果たすべき機能を、対象物・動作・達成すべき状態の形で整理しています。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">工程の機能</caption>
          <thead><tr>
            <th scope="col">工程</th><th scope="col">工程の機能</th><th scope="col">前工程 ／ 後工程</th>
            <th scope="col">特性記号</th><th scope="col">出典</th>
          </tr></thead>
          <tbody><tr>
            <td class="nowrap">工程${esc(curProc)}<div class="cell-sub">${esc(p.name)}</div></td>
            <td class="col-text">${refScope().flow ? esc(p.func)
              : '<span class="status status--todo">工程フローを参照範囲から外したため、機能を確定できません</span>'}</td>
            <td class="nowrap cell-sub">${esc(neighbor(curProc, -1))}<br>${esc(neighbor(curProc, 1))}</td>
            <td class="nowrap">${p.mark ? `${esc(p.mark)}<div class="cell-sub">${esc(DATA.MARK_LEGEND[p.mark])}</div>` : '<span class="cell-empty">—</span>'}</td>
            <td class="nowrap"><button class="btn btn--quiet btn--small" data-ev="flow">根拠資料を確認する</button></td>
          </tr></tbody>
        </table>
      </div>
    </div>`;

  const reqSec = `
    <div class="section">
      <h2 class="section__title">② 図面・条件表・作業標準から要求事項を抽出</h2>
      <p class="section__lead">工程で満たすべき要求事項です。資料に明記のない項目はAIによる推定として区別しています。推定した数値を確定した規格値として扱わないでください。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">抽出した要求事項</caption>
          <thead><tr>
            <th scope="col">要求事項</th><th scope="col">規格値・条件</th>
            <th scope="col">出典</th><th scope="col">確度</th><th scope="col">根拠</th>
          </tr></thead>
          <tbody>${reqs.map((r, i) => `
            <tr>
              <td class="col-text">${esc(r.req)}</td>
              <td class="nowrap mono">${esc(r.spec)}</td>
              <td class="col-text cell-sub">${esc(r.src)}<br>${esc(r.loc)}</td>
              <td class="nowrap">${r.conf === 'doc'
                ? '<span class="status status--done">資料に明記</span>'
                : '<span class="status status--ai">AI推定・要確認</span>'}</td>
              <td><button class="btn btn--quiet btn--small" data-ev="req:${i}">根拠資料を確認する</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  const modeSec = `
    <div class="section">
      <h2 class="section__title">③ 要求事項からの逸脱として故障モードを生成</h2>
      <p class="section__lead">要求を満たせていない状態そのものを故障モードにしています。原因や影響とは分けています。影響とS・O・Dは既存のFMEAの行から持ってきた候補です。最終判断は担当者が行います。</p>
      <div class="table-meta">新規候補 ${newRows.length} 件　／　既に登録済み ${coveredRows.length} 件　／　${esc(DATA.SOD_CRITERIA.doc)} に照らした候補値</div>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">生成した故障モード</caption>
          <thead><tr>
            <th scope="col">要求事項</th><th scope="col">逸脱の型</th><th scope="col">故障モード</th>
            <th scope="col">故障影響</th><th scope="col">S・O・D候補</th>
            <th scope="col">状態</th><th scope="col">操作</th>
          </tr></thead>
          <tbody>${curRows.map(r => `
            <tr>
              <td class="col-text cell-sub">${esc(r.req.req)}</td>
              <td class="nowrap"><span class="libchip">${esc(r.dev)}</span></td>
              <td class="col-text"><strong>${esc(r.mode)}</strong></td>
              <td class="col-text">${esc(r.eff)}</td>
              <td class="nowrap">${sodCell(r)}</td>
              <td class="nowrap">${r.state === 'covered'
                ? '<span class="status status--done">既に登録済み</span>'
                : '<span class="status status--ai">AI提案</span>'}</td>
              <td class="nowrap">
                <button class="btn btn--quiet btn--small" data-ev="row:${esc(r.key)}">根拠資料を確認する</button>
                ${r.state === 'new' ? `<button class="btn btn--quiet btn--small" data-adopt="${esc(r.key)}">ドラフトへ採用</button>` : ''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  const gapSec = (wide && curGaps.length) ? `
    <div class="section">
      <h2 class="section__title">さらに、類似工程の実績から確認すべき候補</h2>
      <p class="section__lead">他工程には登録があり、本工程でも成立しうるにもかかわらず登録がない型です。工程横断で抽出した確認候補であり、本工程への適用要否は担当者が判断してください。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">類似工程からの抜け漏れ候補</caption>
          <thead><tr>
            <th scope="col">逸脱の型</th><th scope="col">故障モード候補</th><th scope="col">想定される影響</th>
            <th scope="col">出典の工程</th><th scope="col">本工程で確認すべき理由</th><th scope="col">操作</th>
          </tr></thead>
          <tbody>${curGaps.map((g, i) => `
            <tr>
              <td class="nowrap"><span class="libchip">${esc(g.dev)}</span></td>
              <td class="col-text"><strong>${esc(g.rec.mode)}</strong></td>
              <td class="col-text">${esc(g.rec.eff)}</td>
              <td class="nowrap">工程${esc(g.rec.proc)}<div class="cell-sub">${esc(PROC_BY_NO[g.rec.proc].name)}</div></td>
              <td class="col-text cell-sub">本工程の要求事項「${esc(g.relReq.req)}」にも「${esc(g.dev)}」が成立し得ますが、本工程には同じ型の登録がありません</td>
              <td class="nowrap">
                <button class="btn btn--quiet btn--small" data-ev="gap:${i}">根拠資料を確認する</button>
                <button class="btn btn--quiet btn--small" data-gapadopt="${i}">ドラフトへ採用</button>
                <button class="btn btn--quiet btn--small" data-gaphold="${i}">保留</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : (wide ? `
    <div class="section">
      <h2 class="section__title">さらに、類似工程の実績から確認すべき候補</h2>
      <div class="empty">
        <h3 class="empty__title">追加の故障モード候補は見つかりませんでした</h3>
        <div class="empty__body">
          <p>現在の参照情報では、他工程の実績から本工程へ展開すべき候補はありません。範囲を広げる場合は、次を試せます。</p>
          <ul>
            <li>参照範囲に他機種（ACT-210／ACT-230）の工程FMEAを追加する</li>
            <li>過去不具合の記録を対象期間を広げて再検索する</li>
          </ul>
        </div>
      </div>
    </div>` : '');

  const draftSec = `
    <div class="section">
      <h2 class="section__title">工程FMEAドラフト</h2>
      <p class="section__lead">採用した内容を工程FMEAドラフトとしてまとめています。行の状態はすべて未確定です。担当者の確認後に確定してください。</p>
      <div class="table-meta" id="draftMeta"></div>
      <div id="draftArea"></div>
      <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);flex-wrap:wrap">
        <button class="btn btn--primary" id="btnDraftCsv">工程FMEAドラフトをExcelで出力する</button>
        <button class="btn btn--secondary" id="btnReview">レビュー依頼のイメージを見る</button>
      </div>
    </div>

    <div class="callout callout--warn">
      <div>
        <p class="callout__title">この結果を使うときの注意</p>
        <p>S・O・Dは、${esc(DATA.SOD_CRITERIA.doc)} および既存の工程FMEAを参照した候補値です。参照できる行がない場合は「未評価」として表示し、点数を推定で埋めることはしません。資料に明記のない要求事項は、AIの推定として区別しています。採否および最終評価は担当者が判断してください。</p>
      </div>
    </div>`;

  $('#genResult').innerHTML = summary + funcSec + reqSec + modeSec + gapSec + draftSec;
  renderDraft();
  $('#btnDraftCsv').addEventListener('click', exportDraft);
  $('#btnReview').addEventListener('click', () => {
    if (!draft.length) { toast('採用された行がありません', 'ドラフトへ採用した行がないため、レビュー依頼は送れません。', 'warn'); return; }
    toast('レビュー依頼を作成しました', `${draft.length} 行のドラフトについて、ここでレビュー依頼が作られます。デモのため実際には送信されません。`);
  });
}

function neighbor(no, delta) {
  const i = DATA.PROCESSES.findIndex(p => p.no === no) + delta;
  const p = DATA.PROCESSES[i];
  return (delta < 0 ? '前工程：' : '後工程：') + (p ? `工程${p.no} ${p.name}` : 'なし');
}

function renderDraft() {
  const meta = $('#draftMeta'), area = $('#draftArea');
  if (!meta) return;
  meta.innerHTML = `採用 <strong>${draft.length} 行</strong>　／　状態はすべて未確定（担当者の確認が必要）`;
  if (!draft.length) {
    area.innerHTML = `
      <div class="empty">
        <h3 class="empty__title">まだ採用された行がありません</h3>
        <div class="empty__body">
          <p>上の「③ 要求事項からの逸脱として故障モードを生成」または「類似工程の実績から確認すべき候補」で、「ドラフトへ採用」を押した行がここに集まります。</p>
        </div>
      </div>`;
    return;
  }
  area.innerHTML = `
    <div class="table-wrap">
      <table>
        <caption class="visually-hidden">工程FMEAドラフト</caption>
        <thead><tr>
          <th scope="col">工程</th><th scope="col">要求事項</th><th scope="col">故障モード</th>
          <th scope="col">故障影響</th><th scope="col">S・O・D</th>
          <th scope="col">区分</th><th scope="col">状態</th><th scope="col">操作</th>
        </tr></thead>
        <tbody>${draft.map((d, i) => `
          <tr>
            <td class="nowrap">工程${esc(d.proc)}</td>
            <td class="col-text cell-sub">${esc(d.req)}</td>
            <td class="col-text"><strong>${esc(d.mode)}</strong></td>
            <td class="col-text">${esc(d.eff)}</td>
            <td class="nowrap">${d.s == null
              ? '<span class="status status--todo">未評価</span>'
              : `<span class="sod-badge${d.s >= 8 ? ' sod-badge--hi' : ''}">S${d.s}</span><span class="sod-badge">O${d.o}</span><span class="sod-badge">D${d.d}</span>`}</td>
            <td class="nowrap"><span class="status status--ai">${esc(d.src)}</span></td>
            <td class="nowrap"><span class="status status--todo">未確定</span></td>
            <td class="nowrap"><button class="btn btn--quiet btn--small" data-drop="${i}">この行を削除する</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function exportDraft() {
  if (!draft.length) {
    toast('出力できる行がありません', 'ドラフトへ採用した行がないため、出力する内容がありません。', 'warn');
    return;
  }
  downloadXlsx(`工程FMEAドラフト_工程${curProc}_${today()}.xlsx`, [
    ['工程番号', '工程名', '工程機能', '要求事項', '規格値・条件', '逸脱の型', '故障モード', '故障影響',
     '重大度S', '故障原因', '発生度O', '現在の予防管理', '現在の検出管理', '検出度D', 'RPN',
     '推奨対応', '担当者', '参照資料', 'AI提案／人による確定の区分', '確認状態'],
    ...draft.map(d => [
      d.proc, PROC_BY_NO[d.proc].name, PROC_BY_NO[d.proc].func, d.req, d.spec || '', d.dev, d.mode, d.eff,
      d.s == null ? '未評価' : d.s, d.cause || '', d.o == null ? '未評価' : d.o,
      d.prev || '', d.det || '', d.d == null ? '未評価' : d.d,
      (d.s != null ? d.s * d.o * d.d : '未評価'),
      '', '', d.ref || '', d.src, '未確定'
    ])
  ]);
  toast('工程FMEAドラフトを出力しました', `${draft.length} 行を20列の様式で出力しました。AI提案と人による確定の区分を列に含めています。`);
}

/* ---- 根拠パネル ---- */
function evFlow() {
  const p = PROC_BY_NO[curProc];
  openPanel('根拠資料：工程フロー', `
    <dl class="meta-list">
      <dt>文書名</dt><dd>工程フロー ACT-220 第一工場 組立ライン</dd>
      <dt>文書種別</dt><dd>工程フローチャート</dd>
      <dt>該当箇所</dt><dd>工程${esc(curProc)} の行</dd>
    </dl>
    <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">該当箇所の記載</h3>
    <div class="quote">
      <p><strong>工程番号</strong>　${esc(curProc)}</p>
      <p style="margin-top:var(--space-2)"><strong>工程名</strong>　${esc(p.name)}</p>
      <p style="margin-top:var(--space-2)"><strong>作業内容・機能</strong>　<mark>${esc(p.func)}</mark></p>
      <p style="margin-top:var(--space-2)"><strong>要求事項の記載</strong>　${esc(p.req)}</p>
      <p style="margin-top:var(--space-2)"><strong>特性記号</strong>　${esc(p.mark || 'なし')}</p>
    </div>
    ${sheetShot('flow', '工程フロー図 ACT-220（QC工程表を同一帳票に含む）',
       '工程の機能は、この帳票の該当行の作業内容欄から整理しています。')}
    <p style="margin-top:var(--space-4);font-size:var(--font-caption)">この情報を根拠とした理由：工程の機能は工程フローの作業内容欄から整理しています。工程FMEAの起点を工程に固定するため、機能の出典は必ず工程フローとしています。</p>`);
}

function evReq(i) {
  const r = (DATA.PROC_REQS[curProc] || [])[i];
  if (!r) return;
  openPanel('根拠資料：' + r.src, `
    <dl class="meta-list">
      <dt>文書名</dt><dd>${esc(r.src)}</dd>
      <dt>該当箇所</dt><dd>${esc(r.loc)}</dd>
      <dt>工程</dt><dd>${esc(procLabel(curProc))}</dd>
      <dt>情報の確度</dt><dd>${r.conf === 'doc' ? '資料に明記された内容' : 'AIによる推定（担当者による確認が必要）'}</dd>
    </dl>
    <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">該当箇所の記載</h3>
    <div class="quote">
      <p><strong>要求事項</strong><br>${esc(r.req)}</p>
      <p style="margin-top:var(--space-3)"><strong>規格値・条件</strong><br><mark>${esc(r.spec)}</mark></p>
    </div>
    ${r.conf === 'ai' ? `
      <div class="callout callout--warn" style="margin-top:var(--space-4)">
        <div>
          <p class="callout__title">この要求事項は資料で確認できていません</p>
          <p>類似工程の記載と部品表からAIが推定した内容です。規格値は未確認として扱ってください。確認先：条件表または品質基準の原本。</p>
        </div>
      </div>` : `
      <p style="margin-top:var(--space-4);font-size:var(--font-caption)">この情報を根拠とした理由：${esc(r.src)} の ${esc(r.loc)} に規格値が明記されているため、確定した要求事項として扱っています。</p>`}`);
}

function evRow(key) {
  const r = curRows.find(x => x.key === key);
  if (!r) return;
  const b = r.basis;
  openPanel('根拠資料：' + r.mode, `
    <dl class="meta-list">
      <dt>工程</dt><dd>${esc(procLabel(r.proc))}</dd>
      <dt>導出の連鎖</dt><dd>工程 → 機能 → 要求事項 → 逸脱 → 故障モード</dd>
    </dl>
    <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">この故障モードを導いた過程</h3>
    <div class="quote">
      <p><strong>工程の機能</strong><br>${esc(PROC_BY_NO[r.proc].func)}</p>
      <p style="margin-top:var(--space-3)"><strong>要求事項</strong><br>${esc(r.req.req)}（${esc(r.req.spec)}）<br>
        <span class="cell-sub">出典：${esc(r.req.src)}　${esc(r.req.loc)}</span></p>
      <p style="margin-top:var(--space-3)"><strong>逸脱の型</strong><br>${esc(r.dev)}</p>
      <p style="margin-top:var(--space-3)"><strong>故障モード</strong><br><mark>${esc(r.mode)}</mark></p>
    </div>
    ${b ? `
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">影響・原因・管理の引き当て元</h3>
      <p class="cell-sub" style="margin-bottom:var(--space-2)">
        ${r.sameProcBasis ? '同工程' : '類似工程'}の既存FMEA行（${esc(procLabel(b.proc))}）から引き当てています。関連度 ${Math.round(r.bs * 100)}%。
      </p>
      <div class="quote">
        <p><strong>故障影響</strong><br>${esc(b.eff)}</p>
        <p style="margin-top:var(--space-3)"><strong>原因</strong><br>${esc(b.cause)}</p>
        <p style="margin-top:var(--space-3)"><strong>現行の予防</strong><br>${esc(b.prev)}</p>
        <p style="margin-top:var(--space-3)"><strong>現行の検出</strong><br>${esc(b.det)}</p>
      </div>
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">S・O・D候補の根拠</h3>
      <dl class="meta-list">
        <dt>重大度S：${b.s}（AI候補）</dt><dd>${esc(critLabel('s', b.s))}</dd>
        <dt>発生度O：${b.o}（AI候補）</dt><dd>${esc(critLabel('o', b.o))}</dd>
        <dt>検出度D：${b.d}（AI候補）</dt><dd>${esc(critLabel('d', b.d))}</dd>
      </dl>
      <p style="margin-top:var(--space-3);font-size:var(--font-caption)">判定基準：${esc(DATA.SOD_CRITERIA.doc)}。引き当て元の行と同じ影響区分と仮定した候補値です。担当者による確認が必要です。</p>
      ${sheetShot('pfmea', '工程FMEA ACT-220 Ver.09（様式1）— 引き当て元の帳票',
        '影響・原因・予防・検出は、この帳票の該当行を参照しています。')}
      ${b.src && TR_BY_ID[b.src] ? `
        <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">参照行の登録契機となった不具合</h3>
        <p><span class="mono">${esc(b.src)}</span>（${esc(TR_BY_ID[b.src].date)}）${esc(TR_BY_ID[b.src].sym)}</p>` : ''}
    ` : `
      <div class="callout callout--warn" style="margin-top:var(--space-4)">
        <div>
          <p class="callout__title">明示的な参照資料が見つかりませんでした</p>
          <p>工程フローと要求事項から生成した候補です。既存の工程FMEAに同種の行がないため、故障影響とS・O・Dは提示していません。担当者による確認が必要です。</p>
        </div>
      </div>`}`);
}

function evGap(i) {
  const g = curGaps[i];
  if (!g) return;
  const r = g.rec;
  openPanel('根拠資料：' + r.mode, `
    <dl class="meta-list">
      <dt>出典</dt><dd>既存の工程FMEA　${esc(procLabel(r.proc))}</dd>
      <dt>逸脱の型</dt><dd>${esc(g.dev)}</dd>
      <dt>本工程での登録状況</dt><dd>この型の故障モードは本工程に登録がありません</dd>
    </dl>
    <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">出典の記載</h3>
    <div class="quote">
      <p><strong>故障モード</strong><br><mark>${esc(r.mode)}</mark></p>
      <p style="margin-top:var(--space-3)"><strong>影響</strong><br>${esc(r.eff)}</p>
      <p style="margin-top:var(--space-3)"><strong>原因</strong><br>${esc(r.cause)}</p>
      <p style="margin-top:var(--space-3)"><strong>現行の予防 ／ 検出</strong><br>${esc(r.prev)} ／ ${esc(r.det)}</p>
      <p style="margin-top:var(--space-3)"><strong>評価</strong><br><span class="mono">S${r.s}　O${r.o}　D${r.d}　RPN ${r.s * r.o * r.d}</span></p>
    </div>
    <p style="margin-top:var(--space-4);font-size:var(--font-caption)">拾った理由：この工程の要求「${esc(g.relReq.req)}」に対しても「${esc(g.dev)}」は起こりうるのに、この工程のFMEAに同じ型の行がありません。本当に起こりうるかは担当者が判断してください。</p>`);
}

/* ---- 工程フロー画面 ---- */
function renderFlow() {
  $('#flowMeta').textContent =
    `全 ${DATA.PROCESSES.length} 工程　／　要求事項 ${Object.values(DATA.PROC_REQS).reduce((a, b) => a + b.length, 0)} 件を抽出済み`;
  $('#flowBody').innerHTML = DATA.PROCESSES.map(p => {
    const reqs = (DATA.PROC_REQS[p.no] || []).length;
    const fm = DATA.PFMEA.filter(r => r.proc === p.no).length;
    const tr = DATA.TROUBLES.filter(t => t.proc === p.no).length;
    return `<tr>
      <td class="nowrap">工程${esc(p.no)}<div class="cell-sub">${esc(p.name)}</div></td>
      <td class="col-text">${esc(p.func)}</td>
      <td class="nowrap">${p.mark ? esc(p.mark) : '<span class="cell-empty">—</span>'}</td>
      <td class="nowrap mono">${reqs} 件</td>
      <td class="nowrap mono">${fm} 行</td>
      <td class="nowrap mono">${tr ? tr + ' 件' : '—'}</td>
      <td class="nowrap"><button class="btn btn--quiet btn--small" data-pick="${esc(p.no)}">この工程でドラフトを生成する</button></td>
    </tr>`;
  }).join('');
}

/* ---- 既存FMEA画面 ---- */
function renderExisting() {
  const f = $('#exProc').value;
  const rows = DATA.PFMEA.filter(r => !f || r.proc === f);
  $('#exMeta').innerHTML = `全 ${DATA.PFMEA_TOTAL.toLocaleString()} 行のうち ACT-220 の ${DATA.PFMEA.length} 行を登録　／　`
    + `<strong>${rows.length} 行</strong>を表示` + (f ? `　／　絞り込み中：${esc(procLabel(f))}` : '');
  $('#exBody').innerHTML = rows.map(r => `
    <tr>
      <td class="nowrap">工程${esc(r.proc)}<div class="cell-sub">${esc(PROC_BY_NO[r.proc].name)}</div></td>
      <td class="col-text">${esc(r.mode)}</td>
      <td class="col-text">${esc(r.eff)}</td>
      <td class="col-text">${esc(r.prev)}</td>
      <td class="col-text">${esc(r.det)}</td>
      <td class="nowrap"><span class="sod-badge${r.s >= 8 ? ' sod-badge--hi' : ''}">S${r.s}</span><span class="sod-badge">O${r.o}</span><span class="sod-badge">D${r.d}</span></td>
      <td class="nowrap mono">${r.s * r.o * r.d}</td>
      <td class="nowrap">${r.src ? `<button class="btn btn--quiet btn--small" data-extr="${esc(r.src)}">不具合記録を確認する</button>` : '<span class="cell-empty">—</span>'}</td>
    </tr>`).join('');
  return rows;
}

/* ---- 参照文書画面 ---- */
function renderDocs() {
  const count = {};
  Object.values(DATA.PROC_REQS).flat().forEach(r => count[r.src] = (count[r.src] || 0) + 1);
  const kind = s => s.startsWith('図面') ? '図面' : s.startsWith('条件表') ? '条件表'
    : s.startsWith('作業要領書') ? '作業標準' : s.startsWith('検査基準書') ? '検査基準' : 'その他';
  $('#docsBody').innerHTML = Object.keys(count).sort().map(s => `
    <tr>
      <td>${esc(s)}</td>
      <td class="nowrap">${esc(kind(s))}</td>
      <td class="nowrap mono">${count[s]} 件</td>
      <td><span class="status status--done">解析完了</span></td>
    </tr>`).join('')
    + `<tr>
      <td>${esc(DATA.SOD_CRITERIA.doc)}</td>
      <td class="nowrap">評価基準</td>
      <td class="nowrap cell-sub">S・O・Dの判定区分</td>
      <td><span class="status status--done">解析完了</span></td>
    </tr>
    <tr>
      <td>設備仕様書</td>
      <td class="nowrap">設備仕様</td>
      <td class="cell-empty">—</td>
      <td><span class="status status--todo">未登録</span></td>
    </tr>`;
  $('#critDoc').textContent =
    `${DATA.SOD_CRITERIA.doc} を取り込んでいるため、S・O・Dは判定区分に照らした候補値を提示できます。基準を取り込めない場合、AIは点数を提示せず「未評価」として扱います。根拠のない点数は現場の判断を誤らせるためです。`;
}

/* ---- 初期化 ---- */
wireShell();
renderFlow();
renderDocs();
renderExisting();

DATA.PROCESSES.forEach(p => {
  [$('#procSelect'), $('#exProc')].forEach((sel, i) => {
    const o = document.createElement('option');
    o.value = p.no;
    o.textContent = i === 0 ? `${p.no}　${p.name}` : procLabel(p.no);
    sel.appendChild(o);
  });
});
wireDrop({
  file: '#flowFile', sample: '#btnFlowSample', readout: '#flowReadout',
  sampleName: '工程フロー_QC工程表_ACT-220.xlsx',
  rows: [
    { k: '対象ライン', v: 'ACT-220 第一工場 組立ライン' },
    { k: '読み取った工程', v: `${DATA.PROCESSES.length} 件（工程10〜19）` },
    { k: '同時に読み取った帳票', v: 'QC工程表（管理項目と規格値）' }
  ],
  toast: `工程 ${DATA.PROCESSES.length} 件を読み取りました。対象工程から選べます。`,
  onRead: () => { $('#procHint').textContent =
    'アップロードした工程フロー表から読み取った工程です。登録済みの内容と同じ並びになっています。'; }
});

$('#exProc').addEventListener('change', renderExisting);
$('#btnExCsv').addEventListener('click', () => {
  const rows = renderExisting();
  downloadXlsx(`既存工程FMEA_${today()}.xlsx`, [
    ['工程番号', '工程名', '故障モード', '故障影響', '故障原因', '現在の予防管理', '現在の検出管理', 'S', 'O', 'D', 'RPN', '登録契機の不具合'],
    ...rows.map(r => [r.proc, PROC_BY_NO[r.proc].name, r.mode, r.eff, r.cause, r.prev, r.det, r.s, r.o, r.d, r.s * r.o * r.d, r.src || ''])
  ]);
  toast('Excelを出力しました', `${rows.length} 行を出力しました。`);
});

$('#wideNote').textContent =
  `標準生成に加え、既存の工程FMEA ${DATA.PFMEA.length} 行・不具合記録 ${DATA.TROUBLES.length} 件・${DATA.DEVIATIONS.length} 種類の逸脱パターンを横断し、抜け漏れ候補を提示します`;
$('#critNote').textContent = `S・O・Dの判定は ${DATA.SOD_CRITERIA.doc} を参照します。`;

$('#genForm').addEventListener('submit', e => {
  e.preventDefault();
  const proc = $('#procSelect').value;
  if (!proc) {
    $('#procError').hidden = false;
    $('#procSelect').setAttribute('aria-invalid', 'true');
    toast('対象工程を選択してください', '工程を選択すると、工程FMEAドラフトを生成できます。', 'error');
    $('#procSelect').focus();
    return;
  }
  $('#procError').hidden = true;
  $('#procSelect').removeAttribute('aria-invalid');
  curProc = proc;
  draft = [];
  $('#genIdle').hidden = true;
  $('#genResult').hidden = true;
  $('#genLoading').hidden = false;
  const reqs = reqsInScope(proc).length;
  const docs = new Set(reqsInScope(proc).map(r => r.src)).size;
  $('#genLoadMeta').textContent =
    `対象工程：${procLabel(proc)}　／　参照文書 ${docs} 件　／　既存FMEA ${DATA.PFMEA.length} 行　／　要求事項 ${reqs} 件`;
  runSteps('#genStepper', () => {
    curRows = deriveRows(curProc);
    curGaps = gapCandidates(curProc, curRows);
    $('#genLoading').hidden = true;
    renderResult();
    $('#genResult').hidden = false;
  }, 300);
});

document.addEventListener('click', e => {
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    $('#procSelect').value = pick.dataset.pick;
    showView('draft');
    $('#genForm').dispatchEvent(new Event('submit'));
    return;
  }
  const ev = e.target.closest('[data-ev]');
  if (ev) {
    const v = ev.dataset.ev;
    if (v === 'flow') evFlow();
    else if (v.startsWith('req:')) evReq(Number(v.slice(4)));
    else if (v.startsWith('row:')) evRow(v.slice(4));
    else if (v.startsWith('gap:')) evGap(Number(v.slice(4)));
    return;
  }
  const ad = e.target.closest('[data-adopt]');
  if (ad) {
    const r = curRows.find(x => x.key === ad.dataset.adopt);
    if (!r) return;
    if (draft.some(d => d.mode === r.mode)) {
      toast('すでに採用されています', 'この故障モードはドラフトに追加済みです。', 'warn');
      return;
    }
    draft.push({ proc: r.proc, req: r.req.req, spec: r.req.spec, dev: r.dev, mode: r.mode, eff: r.eff,
      cause: r.cause, prev: r.prev, det: r.det, s: r.s, o: r.o, d: r.d,
      ref: r.req.src, src: 'AI提案' });
    renderDraft();
    toast('工程FMEAドラフトへ追加しました', `${r.mode}　状態は「未確定」です。内容を確認のうえ、担当者が確定してください。`);
    return;
  }
  const ga = e.target.closest('[data-gapadopt]');
  if (ga) {
    const g = curGaps[Number(ga.dataset.gapadopt)];
    if (!g) return;
    if (draft.some(d => d.mode === g.rec.mode)) {
      toast('すでに採用されています', 'この故障モードはドラフトに追加済みです。', 'warn');
      return;
    }
    draft.push({ proc: curProc, req: g.relReq.req, spec: g.relReq.spec, dev: g.dev,
      mode: g.rec.mode, eff: g.rec.eff, cause: g.rec.cause, prev: g.rec.prev, det: g.rec.det,
      s: g.rec.s, o: g.rec.o, d: g.rec.d,
      ref: `既存の工程FMEA ${procLabel(g.rec.proc)}`, src: 'AI提案（類似工程）' });
    renderDraft();
    toast('工程FMEAドラフトへ追加しました', `${g.rec.mode}　出典：${procLabel(g.rec.proc)}。状態は未確定です。`);
    return;
  }
  const gh = e.target.closest('[data-gaphold]');
  if (gh) {
    const g = curGaps[Number(gh.dataset.gaphold)];
    toast('保留として記録しました', `${g.rec.mode}　保留一覧から再確認できます。`, 'warn');
    return;
  }
  const dr = e.target.closest('[data-drop]');
  if (dr) {
    const i = Number(dr.dataset.drop);
    const removed = draft.splice(i, 1)[0];
    renderDraft();
    toast('ドラフトから削除しました', removed ? removed.mode : '', 'warn');
    return;
  }
  const et = e.target.closest('[data-extr]');
  if (et) {
    const t = TR_BY_ID[et.dataset.extr];
    if (!t) return;
    openPanel('根拠資料：不具合記録 ' + t.id, `
      <dl class="meta-list">
        <dt>管理番号</dt><dd class="mono">${esc(t.id)}</dd>
        <dt>発生日</dt><dd class="mono">${esc(t.date)}</dd>
        <dt>製品・発生工程</dt><dd>${esc(t.prod)}　／　${esc(procLabel(t.proc))}</dd>
        <dt>評価</dt><dd class="mono">S${t.s}　O${t.o}　D${t.d}</dd>
      </dl>
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">記録原文</h3>
      <div class="quote">
        <p><strong>発生事象</strong><br>${esc(t.sym)}</p>
        <p style="margin-top:var(--space-3)"><strong>原因</strong><br>${esc(t.cause)}</p>
        <p style="margin-top:var(--space-3)"><strong>恒久対策</strong><br>${esc(t.perm)}</p>
      </div>`);
  }
});
