/* デモ1：不具合ナレッジ横断検索 — 埋め込み実データに対してJSで実検索する */
const PROC_BY_NO = {};
DATA.PROCESSES.forEach(p => PROC_BY_NO[p.no] = p);
const TR_BY_ID = {};
DATA.TROUBLES.forEach(t => TR_BY_ID[t.id] = t);

const procLabel = no => PROC_BY_NO[no] ? `工程${no} ${PROC_BY_NO[no].name}` : `工程${no}`;

/* ---- 日本語向けの類似度（2-gram の Dice 係数） ---- */
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
function boostFor(q, rec) {
  const n = norm(q);
  let bump = 0;
  if (rec.prod && n.includes(norm(rec.prod))) bump += 0.18;
  const p = PROC_BY_NO[rec.proc];
  if (p && n.includes(norm(p.name))) bump += 0.14;
  if (rec.part && n.includes(norm(rec.part))) bump += 0.10;
  return bump;
}

function searchTroubles(q) {
  const g = grams(q);
  return DATA.TROUBLES
    .map(t => {
      const text = [t.sym, t.cause, t.part, t.prod, procLabel(t.proc)].join(' ');
      return { rec: t, score: Math.min(1, dice(g, grams(text)) + boostFor(q, t)) };
    })
    .filter(x => x.score >= 0.08)
    .sort((a, b) => b.score - a.score);
}
function searchPfmea(q, proc) {
  const g = grams(q);
  return DATA.PFMEA
    .map(r => {
      const text = [r.mode, r.cause, r.eff, procLabel(r.proc)].join(' ');
      let sc = dice(g, grams(text));
      if (proc && r.proc === proc) sc += 0.22;
      return { rec: r, score: Math.min(1, sc) };
    })
    .filter(x => x.score >= 0.12)
    .sort((a, b) => b.score - a.score);
}
function searchEcn(q) {
  const g = grams(q);
  return DATA.ECNS
    .map(e => ({ rec: e, score: dice(g, grams(e.title + ' ' + e.reason)) }))
    .filter(x => x.score >= 0.10)
    .sort((a, b) => b.score - a.score);
}

/* ---- ダッシュボード ---- */
function renderDashboard() {
  const open = DATA.TROUBLES.filter(t => t.status !== '完了');
  const leak = DATA.TROUBLES.filter(t => t.leak);
  const kpis = [
    { label: '登録済み不具合記録', value: DATA.TROUBLE_TOTAL.toLocaleString(), unit: ' 件',
      note: `2019年以降の全記録。画面には代表 ${DATA.TROUBLES.length} 件を表示しています` },
    { label: '恒久対策が未完了', value: open.length, unit: ' 件', warn: true,
      note: `うち影響度S8以上 ${open.filter(t => t.s >= 8).length} 件` },
    { label: '顧客流出に至った記録', value: leak.length, unit: ' 件', warn: true,
      note: '再発防止の横展開が必要な事例' },
    { label: '工程FMEA 登録行数', value: DATA.PFMEA_TOTAL.toLocaleString(), unit: ' 行',
      note: `全4機種。画面には ACT-220 の ${DATA.PFMEA.length} 行を表示しています` },
    { label: '設計変更通知', value: DATA.ECNS.length, unit: ' 件',
      note: `審査中 ${DATA.ECNS.filter(e => e.status === '審査中').length} 件` }
  ];
  $('#kpiGrid').innerHTML = kpis.map(k => `
    <div class="card">
      <p class="kpi__label">${esc(k.label)}</p>
      <p class="kpi__value"${k.warn ? ' style="color:var(--color-warning)"' : ''}>${esc(k.value)}<span class="kpi__unit">${esc(k.unit)}</span></p>
      <p class="kpi__note">${esc(k.note)}</p>
    </div>`).join('');

  const sorted = open.slice().sort((a, b) => b.s - a.s);
  $('#openMeta').textContent = `${open.length} 件を影響度Sの高い順に表示しています`;
  $('#openBody').innerHTML = sorted.map(t => `
    <tr>
      <td class="mono nowrap">${esc(t.id)}</td>
      <td class="mono nowrap">${esc(t.date)}</td>
      <td class="nowrap">${esc(t.prod)}<div class="cell-sub">${esc(procLabel(t.proc))}</div></td>
      <td class="col-text">${esc(t.sym)}</td>
      <td class="nowrap"><span class="sod-badge${t.s >= 8 ? ' sod-badge--hi' : ''}">S${t.s}</span></td>
      <td><span class="status status--${t.status === '対応中' ? 'warn' : 'todo'}">${esc(t.status)}</span></td>
      <td><button class="btn btn--quiet btn--small" data-tr="${esc(t.id)}">記録を確認する</button></td>
    </tr>`).join('');

  // 工程別の件数分布
  const counts = {};
  DATA.TROUBLES.forEach(t => counts[t.proc] = (counts[t.proc] || 0) + 1);
  const max = Math.max(...Object.values(counts));
  const order = DATA.PROCESSES.filter(p => counts[p.no]);
  $('#procDist').innerHTML = `<div class="dist" style="height:120px">` + order.map(p => {
    const n = counts[p.no];
    return `<div class="dist__col" title="${esc(procLabel(p.no))}：${n}件">
      <span>${n}</span>
      <span class="dist__bar${n >= max ? ' dist__bar--warn' : ''}" style="height:${Math.round(n / max * 84)}px"></span>
      <span class="dist__d mono">${esc(p.no)}</span>
    </div>`;
  }).join('') + `</div>`;
  const top = order.slice().sort((a, b) => counts[b.no] - counts[a.no])[0];
  $('#procNote').textContent =
    `横軸は工程番号です。${procLabel(top.no)}が ${counts[top.no]} 件で最も多く、締結条件の管理と作業順序の指示方法に関する記録が繰り返し登録されています。`;
}

/* ---- 検索結果 ---- */
function pct(x) { return Math.round(x * 100); }

function renderResult(q) {
  const useTr = $('#scTr').checked, useFm = $('#scFm').checked, useEc = $('#scEc').checked;
  const trs = useTr ? searchTroubles(q).slice(0, 5) : [];
  const topProc = trs.length ? trs[0].rec.proc : '';
  const fms = useFm ? searchPfmea(q, topProc).slice(0, 4) : [];
  const ecs = useEc ? searchEcn(q).slice(0, 3) : [];

  if (!trs.length && !fms.length && !ecs.length) {
    $('#qResult').innerHTML = `
      <div class="empty">
        <h2 class="empty__title">該当する記録が見つかりませんでした</h2>
        <div class="empty__body">
          <p>追加で試せること:</p>
          <ul>
            <li>製品名を外して、現象だけで検索する</li>
            <li>「異音」「リーク」「かみ込み」など、現象の表現を変える</li>
            <li>検索範囲の工程FMEAと設計変更通知を有効にする</li>
            <li>未登録の作業要領書・検査記録を取り込む（登録文書の画面を参照）</li>
          </ul>
        </div>
      </div>`;
    return;
  }

  const t0 = trs.length ? trs[0].rec : null;
  const sameProc = t0 ? DATA.TROUBLES.filter(t => t.proc === t0.proc) : [];
  const leaked = sameProc.filter(t => t.leak);

  let concl = '';
  if (t0) {
    concl = `入力された事象に近い不具合記録が ${trs.length} 件見つかりました。最も近いのは `
      + `<span class="mono">${esc(t0.id)}</span>（${esc(t0.date)}・${esc(t0.prod)}・${esc(procLabel(t0.proc))}）で、`
      + `原因は「${esc(t0.cause)}」でした。`
      + `同じ${esc(procLabel(t0.proc))}では過去に ${sameProc.length} 件が登録されており、`
      + (leaked.length
          ? `うち ${leaked.length} 件は顧客流出に至っています。出荷済み品の確認が必要かどうかを先に判断してください。`
          : `顧客流出に至った記録はありません。`);
  } else {
    concl = `不具合記録では一致が見つかりませんでしたが、工程FMEAまたは設計変更通知に関連する内容があります。`;
  }

  const trTable = trs.length ? `
    <div class="section">
      <h2 class="section__title">類似する不具合記録</h2>
      <p class="section__lead">関連度は入力された文章と記録内容の一致度です。順位は参考であり、採否は担当者が判断してください。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">類似する不具合記録</caption>
          <thead><tr>
            <th scope="col">関連度</th><th scope="col">記録</th>
            <th scope="col">現象</th><th scope="col">推定原因</th><th scope="col">根拠</th>
          </tr></thead>
          <tbody>${trs.map(x => `
            <tr>
              <td class="mono nowrap">${pct(x.score)}%</td>
              <td class="nowrap">
                <span class="mono">${esc(x.rec.id)}</span>
                <div class="cell-sub mono">${esc(x.rec.date)}</div>
                <div class="cell-sub">${esc(procLabel(x.rec.proc))}</div>
                ${x.rec.leak ? '<div style="margin-top:var(--space-1)"><span class="status status--risk">流出あり</span></div>' : ''}
              </td>
              <td class="col-text">${esc(x.rec.sym)}</td>
              <td class="col-text">${esc(x.rec.cause)}</td>
              <td><button class="btn btn--quiet btn--small" data-tr="${esc(x.rec.id)}">根拠を確認する</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : '';

  const fmTable = fms.length ? `
    <div class="section">
      <h2 class="section__title">工程FMEAに登録済みの故障モード</h2>
      <p class="section__lead">同じ工程の工程FMEAに、今回の事象に対応する故障モードが登録されているかを確認できます。登録済みであれば、予防・検出の手段が機能しなかった理由の調査に進めます。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">関連する工程FMEAの行</caption>
          <thead><tr>
            <th scope="col">工程</th><th scope="col">故障モード</th><th scope="col">現行の予防</th>
            <th scope="col">現行の検出</th><th scope="col">S・O・D</th><th scope="col">根拠</th>
          </tr></thead>
          <tbody>${fms.map(x => `
            <tr>
              <td class="nowrap">工程${esc(x.rec.proc)}<div class="cell-sub">${esc(PROC_BY_NO[x.rec.proc] ? PROC_BY_NO[x.rec.proc].name : '')}</div></td>
              <td class="col-text">${esc(x.rec.mode)}</td>
              <td class="col-text">${esc(x.rec.prev)}</td>
              <td class="col-text">${esc(x.rec.det)}</td>
              <td class="nowrap">
                <span class="sod-badge${x.rec.s >= 8 ? ' sod-badge--hi' : ''}">S${x.rec.s}</span>
                <span class="sod-badge">O${x.rec.o}</span>
                <span class="sod-badge">D${x.rec.d}</span>
              </td>
              <td><button class="btn btn--quiet btn--small" data-fm="${esc(x.rec.proc)}|${esc(x.rec.mode)}">根拠を確認する</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : '';

  const ecTable = ecs.length ? `
    <div class="section">
      <h2 class="section__title">関連する設計変更通知</h2>
      <p class="section__lead">同種の事象に対して、過去に設計変更で対応した記録です。今回も設計側の対応が必要かどうかの判断材料になります。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">関連する設計変更通知</caption>
          <thead><tr>
            <th scope="col">通知番号</th><th scope="col">発行日</th><th scope="col">内容</th>
            <th scope="col">発行理由</th><th scope="col">状態</th>
          </tr></thead>
          <tbody>${ecs.map(x => `
            <tr>
              <td class="mono">${esc(x.rec.no)}</td>
              <td class="mono">${esc(x.rec.date)}</td>
              <td>${esc(x.rec.title)}</td>
              <td>${esc(x.rec.reason)}</td>
              <td><span class="status status--${x.rec.status === '適用済み' ? 'done' : 'warn'}">${esc(x.rec.status)}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : '';

  // 確認すべき項目（実データの恒久対策・予防手段から導出）
  const checks = [];
  if (t0) {
    checks.push(`${procLabel(t0.proc)}で過去に実施した恒久対策「${t0.perm}」が、今回の対象ロットにも適用されているか`);
    if (leaked.length) checks.push(`同工程で顧客流出の実績があるため、出荷済み品の範囲特定と顧客への連絡要否を先に判断する`);
  }
  fms.slice(0, 2).forEach(x => {
    checks.push(`工程FMEAに登録済みの検出手段「${x.rec.det}」が今回機能しなかった理由（検出をすり抜けた条件）`);
  });
  if (t0 && DATA.TROUBLES.filter(t => t.proc === t0.proc && t.status !== '完了').length) {
    checks.push(`同工程に恒久対策が未完了の記録が残っているため、今回の事象と同一原因かどうかの切り分け`);
  }
  checks.push(`作業要領書と検査記録が未登録のため、作業条件・測定値の実績はシステム外での確認が必要`);

  $('#qResult').innerHTML = `
    <div class="card" style="border-left:4px solid var(--color-primary)">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
        <span class="status status--ai">AIによる整理結果</span>
        <span class="cell-sub">生成 ${today()}　／　検索対象 ${DATA.TROUBLE_TOTAL.toLocaleString()}件の不具合記録・${DATA.PFMEA_TOTAL.toLocaleString()}行の工程FMEA・${DATA.ECNS.length}件の設計変更通知</span>
      </div>
      <h2 style="font-size:var(--font-subsection-title);margin-bottom:var(--space-2)">確認結果</h2>
      <p style="line-height:var(--line-height-body)">${concl}</p>
    </div>

    ${trTable}${fmTable}${ecTable}

    <div class="section">
      <h2 class="section__title">今回確認すべき項目</h2>
      <p class="section__lead">過去の対策内容と工程FMEAの記載から導いた確認項目です。AIによる提案であり、実施の判断は担当者が行います。</p>
      <div class="card">
        <ol style="margin:0;padding-left:1.3em;line-height:var(--line-height-body)">
          ${checks.map(c => `<li style="margin-bottom:var(--space-2)">${esc(c)}</li>`).join('')}
        </ol>
      </div>
    </div>

    <div class="callout callout--warn">
      <div>
        <p class="callout__title">この結果を使うときの注意</p>
        <p>関連度は文章の一致度による並び替えであり、原因の断定ではありません。作業要領書・検査記録が未登録のため、作業条件まで遡った確認はシステム外で行う必要があります。最終的な原因の特定と対策の決定は担当者が行ってください。</p>
      </div>
    </div>`;
}

/* ---- 根拠パネル ---- */
function openTroublePanel(id) {
  const t = TR_BY_ID[id];
  if (!t) return;
  const related = DATA.PFMEA.filter(r => r.src === id);
  const ecn = DATA.ECNS.filter(e => e.src === id);
  openPanel('根拠資料：不具合記録 ' + t.id, `
    <dl class="meta-list">
      <dt>管理番号</dt><dd class="mono">${esc(t.id)}</dd>
      <dt>発生日</dt><dd class="mono">${esc(t.date)}</dd>
      <dt>製品・発生工程</dt><dd>${esc(t.prod)}　／　${esc(procLabel(t.proc))}</dd>
      <dt>対象部位</dt><dd>${esc(t.part)}</dd>
      <dt>影響度S ／ 発生度O ／ 検出度D</dt><dd class="mono">S${t.s}　O${t.o}　D${t.d}</dd>
      <dt>担当 ／ 状態</dt><dd>${esc(t.owner)}　／　${esc(t.status)}${t.leak ? '　／　顧客流出あり' : ''}</dd>
      <dt>関連する設計審査</dt><dd>${esc(t.dr)}</dd>
    </dl>
    <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">記録原文</h3>
    <div class="quote">
      <p><strong>発生事象</strong><br>${esc(t.sym)}</p>
      <p style="margin-top:var(--space-3)"><strong>原因</strong><br>${esc(t.cause)}</p>
      <p style="margin-top:var(--space-3)"><strong>暫定対策</strong><br>${esc(t.tmp)}</p>
      <p style="margin-top:var(--space-3)"><strong>恒久対策</strong><br>${esc(t.perm)}</p>
    </div>
    ${related.length ? `
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">この記録を出典とする工程FMEAの行</h3>
      <ul style="margin:0;padding-left:1.2em;line-height:var(--line-height-body)">
        ${related.map(r => `<li>${esc(procLabel(r.proc))}：${esc(r.mode)}</li>`).join('')}
      </ul>` : ''}
    ${ecn.length ? `
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">この記録を理由とする設計変更</h3>
      <ul style="margin:0;padding-left:1.2em;line-height:var(--line-height-body)">
        ${ecn.map(e => `<li><span class="mono">${esc(e.no)}</span>　${esc(e.title)}</li>`).join('')}
      </ul>` : ''}
    <p style="margin-top:var(--space-5);font-size:var(--font-caption);color:var(--color-text-secondary)">出典：不具合記録データベース（架空データ）。原本の記載をそのまま表示しています。</p>`);
}

function openFmeaPanel(key) {
  const [proc, mode] = key.split('|');
  const r = DATA.PFMEA.find(x => x.proc === proc && x.mode === mode);
  if (!r) return;
  const p = PROC_BY_NO[proc];
  const src = r.src ? TR_BY_ID[r.src] : null;
  openPanel('根拠資料：工程FMEA ' + procLabel(proc), `
    <dl class="meta-list">
      <dt>工程</dt><dd>${esc(procLabel(proc))}${p && p.mark ? `　／　特性記号 ${esc(p.mark)}（${esc(DATA.MARK_LEGEND[p.mark] || '')}）` : ''}</dd>
      <dt>工程の機能</dt><dd>${esc(p ? p.func : '—')}</dd>
      <dt>要求事項</dt><dd>${esc(p ? p.req : '—')}</dd>
    </dl>
    <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">工程FMEAの記載</h3>
    <div class="quote">
      <p><strong>故障モード</strong><br>${esc(r.mode)}</p>
      <p style="margin-top:var(--space-3)"><strong>影響</strong><br>${esc(r.eff)}</p>
      <p style="margin-top:var(--space-3)"><strong>原因</strong><br>${esc(r.cause)}</p>
      <p style="margin-top:var(--space-3)"><strong>現行の予防</strong><br>${esc(r.prev)}</p>
      <p style="margin-top:var(--space-3)"><strong>現行の検出</strong><br>${esc(r.det)}</p>
      <p style="margin-top:var(--space-3)"><strong>評価</strong><br><span class="mono">S${r.s}　O${r.o}　D${r.d}　RPN ${r.s * r.o * r.d}</span></p>
    </div>
    ${src ? `
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">この行の登録契機となった不具合</h3>
      <p><span class="mono">${esc(src.id)}</span>（${esc(src.date)}）${esc(src.sym)}</p>
      <p style="margin-top:var(--space-2)"><button class="btn btn--quiet btn--small" data-tr="${esc(src.id)}">この不具合記録を確認する</button></p>` : `
      <p style="margin-top:var(--space-5);font-size:var(--font-caption);color:var(--color-text-secondary)">この行に紐づく不具合記録はありません。過去の設計知見または類似機種からの流用で登録された行です。</p>`}
    <p style="margin-top:var(--space-5);font-size:var(--font-caption);color:var(--color-text-secondary)">出典：工程FMEA ACT-220（架空データ）。</p>`);
}

/* ---- 不具合記録一覧 ---- */
function renderList() {
  const prod = $('#fProd').value, proc = $('#fProc').value,
        stat = $('#fStat').value, leak = $('#fLeak').value;
  const rows = DATA.TROUBLES.filter(t =>
    (!prod || t.prod === prod) && (!proc || t.proc === proc) &&
    (!stat || t.status === stat) && (!leak || String(t.leak ? 1 : 0) === leak));

  const filtered = [prod && `製品=${prod}`, proc && `工程=${proc}`, stat && `状態=${stat}`,
                    leak && `流出=${leak === '1' ? 'あり' : 'なし'}`].filter(Boolean);
  $('#listMeta').innerHTML = `全 ${DATA.TROUBLES.length} 件中 <strong>${rows.length} 件</strong>を表示`
    + (filtered.length ? `　／　絞り込み中：${esc(filtered.join('、'))}` : '');
  $('#listEmpty').hidden = rows.length > 0;
  $('#listBody').closest('.table-wrap').hidden = rows.length === 0;
  $('#listBody').innerHTML = rows.map(t => `
    <tr>
      <td class="mono nowrap">${esc(t.id)}</td>
      <td class="mono nowrap">${esc(t.date)}</td>
      <td class="nowrap">${esc(t.prod)}</td>
      <td class="nowrap">工程${esc(t.proc)}<div class="cell-sub">${esc(PROC_BY_NO[t.proc] ? PROC_BY_NO[t.proc].name : '')}</div></td>
      <td class="col-text">${esc(t.sym)}${t.leak ? '<div class="cell-sub" style="color:var(--color-error)">顧客流出あり</div>' : ''}</td>
      <td class="nowrap"><span class="sod-badge${t.s >= 8 ? ' sod-badge--hi' : ''}">${t.s}</span></td>
      <td class="nowrap"><span class="sod-badge">${t.o}</span></td>
      <td class="nowrap"><span class="sod-badge">${t.d}</span></td>
      <td><span class="status status--${t.status === '完了' ? 'done' : t.status === '対応中' ? 'warn' : 'todo'}">${esc(t.status)}</span></td>
      <td><button class="btn btn--quiet btn--small" data-tr="${esc(t.id)}">記録を確認する</button></td>
    </tr>`).join('');
  return rows;
}

/* ---- 登録文書 ---- */
function renderDocs() {
  const docs = [
    { doc: '不具合記録データベース', kind: '社内システム抽出', n: `${DATA.TROUBLE_TOTAL.toLocaleString()} 件`, at: '2026-08-01', st: 'done', stTxt: '解析完了' },
    { doc: '工程FMEA（ACT-210／220／230／SNS-100）', kind: '様式1', n: `${DATA.PFMEA_TOTAL.toLocaleString()} 行`, at: '2026-08-01', st: 'done', stTxt: '解析完了' },
    { doc: '設計変更通知（ECN）', kind: '変更管理帳票', n: `${DATA.ECNS.length} 件`, at: '2026-08-01', st: 'done', stTxt: '解析完了' },
    { doc: '製品図面', kind: '図面', n: `${DATA.DRAWINGS.length} 件`, at: '2026-08-01', st: 'done', stTxt: '解析完了' },
    { doc: '設計審査記録（DR1〜DR4）', kind: '審査記録', n: `${DATA.DR_FINDINGS.length} 件の指摘`, at: '2026-08-01', st: 'done', stTxt: '解析完了' },
    { doc: '作業要領書', kind: '作業標準', n: '—', at: '—', st: 'todo', stTxt: '未登録' },
    { doc: '検査記録（測定値）', kind: '検査記録', n: '—', at: '—', st: 'todo', stTxt: '未登録' }
  ];
  $('#docsBody').innerHTML = docs.map(d => `
    <tr>
      <td>${esc(d.doc)}</td>
      <td>${esc(d.kind)}</td>
      <td class="mono">${esc(d.n)}</td>
      <td class="mono">${esc(d.at)}</td>
      <td><span class="status status--${d.st}">${esc(d.stTxt)}</span></td>
    </tr>`).join('');
}

/* ---- 初期化 ---- */
const EXAMPLES = [
  'ACT-220のケース締結部から異音が出ている',
  'コネクタが半嵌合のまま組み付けられた',
  'はんだのクラックで導通不良が起きた',
  '気密検査でリーク量が規格を超えた',
  '低温で作動角が規格下限を下回る'
];

wireShell();
renderDashboard();
renderDocs();

$('#qChips').innerHTML = EXAMPLES.map(e =>
  `<button class="chip" type="button" data-q="${esc(e)}">${esc(e)}</button>`).join('');
$('#qChips').addEventListener('click', e => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  $('#q').value = b.dataset.q;
  $('#q').focus();
});

DATA.PRODUCTS.forEach(p => {
  const o = document.createElement('option');
  o.value = o.textContent = p.code;
  $('#fProd').appendChild(o);
});
DATA.PROCESSES.forEach(p => {
  const o = document.createElement('option');
  o.value = p.no; o.textContent = procLabel(p.no);
  $('#fProc').appendChild(o);
});
['#fProd', '#fProc', '#fStat', '#fLeak'].forEach(s =>
  $(s).addEventListener('change', renderList));
renderList();

$('#btnListCsv').addEventListener('click', () => {
  const rows = renderList();
  downloadCsv(`不具合記録一覧_${today()}.csv`, [
    ['管理番号', '発生日', '製品', '発生工程', '対象部位', '現象', '原因', '暫定対策', '恒久対策', 'S', 'O', 'D', '担当', '状態', '顧客流出'],
    ...rows.map(t => [t.id, t.date, t.prod, procLabel(t.proc), t.part, t.sym, t.cause, t.tmp, t.perm, t.s, t.o, t.d, t.owner, t.status, t.leak ? 'あり' : 'なし'])
  ]);
  toast('CSVを出力しました', `${rows.length} 件を出力しました。Excelでそのまま開けます。`);
});

$('#qForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (!q) {
    toast('事象を入力してください', '「発生している事象」が未入力です。文章のままで構いません。', 'error');
    $('#q').focus();
    return;
  }
  $('#qIdle').hidden = true;
  $('#qResult').hidden = true;
  $('#qLoading').hidden = false;
  $('#qLoadMeta').textContent =
    `対象：不具合記録 ${DATA.TROUBLE_TOTAL.toLocaleString()}件／工程FMEA ${DATA.PFMEA_TOTAL.toLocaleString()}行／設計変更通知 ${DATA.ECNS.length}件`;
  runSteps('#qStepper', () => {
    $('#qLoading').hidden = true;
    renderResult(q);
    $('#qResult').hidden = false;
  }, 340);
});

document.addEventListener('click', e => {
  const tr = e.target.closest('[data-tr]');
  if (tr) { openTroublePanel(tr.dataset.tr); return; }
  const fm = e.target.closest('[data-fm]');
  if (fm) { openFmeaPanel(fm.dataset.fm); }
});
