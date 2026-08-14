/* デモ4：設計審査（DR）支援
   標準の確認項目を起点に、変更点・過去不具合・前回DR指摘を突き合わせて優先度を付ける。
   AIは項目を削らない（落とす判断は主査が行う）。指摘は起票から完了まで追跡する。 */

const TR_BY_ID = {};
DATA.TROUBLES.forEach(t => TR_BY_ID[t.id] = t);
const GATE_BY_ID = {};
DATA.DR_GATES.forEach(g => GATE_BY_ID[g.id] = g);

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

let findings = DATA.DR_FINDINGS.map(f => ({ ...f }));
let curPrep = [];

/* ---- 突き合わせ ---- */
function buildPrep(gate) {
  const list = DATA.DR_CHECKLIST[gate] || [];
  const useCh = $('#mxChange').checked, useTr = $('#mxTrouble').checked, usePrev = $('#mxPrev').checked;

  return list.map(item => {
    const g = grams(item.item + ' ' + item.cat);
    const hits = [];

    if (useCh) {
      let best = null, bs = 0;
      DATA.DRBFM.forEach(d => {
        const s = dice(g, grams(d.worry + ' ' + d.mode + ' ' + d.cp));
        if (s > bs) { bs = s; best = d; }
      });
      if (bs >= 0.14) hits.push({ kind: 'change', score: bs, rec: best,
        why: `今回の変更「${best.cp}」で、この観点にリスクが生じます` });
    }
    if (useTr) {
      let best = null, bs = 0;
      DATA.TROUBLES.forEach(t => {
        const s = dice(g, grams(t.sym + ' ' + t.cause));
        if (s > bs) { bs = s; best = t; }
      });
      if (bs >= 0.14) hits.push({ kind: 'trouble', score: bs, rec: best,
        why: `過去に同じ観点で不具合が発生しています（${best.id}）` });
    }
    if (usePrev) {
      const open = findings.filter(f => f.status !== '完了');
      let best = null, bs = 0;
      open.forEach(f => {
        const s = dice(g, grams(f.item + ' ' + f.cat));
        if (s > bs) { bs = s; best = f; }
      });
      if (bs >= 0.18) hits.push({ kind: 'prev', score: bs, rec: best,
        why: `前回のDRで指摘され、まだ完了していません（${best.id}）` });
    }

    const score = hits.reduce((a, h) => a + h.score, 0) + (hits.some(h => h.kind === 'prev') ? 0.4 : 0);
    const level = hits.length === 0 ? 'std' : (score >= 0.5 || hits.length >= 2 ? 'high' : 'mid');
    return { item, hits, score, level };
  }).sort((a, b) => b.score - a.score);
}

const LEVEL_LABEL = {
  high: '<span class="status status--risk">重点確認</span>',
  mid: '<span class="status status--warn">確認</span>',
  std: '<span class="status status--todo">標準項目</span>'
};
const KIND_LABEL = { change: '変更点', trouble: '過去不具合', prev: '前回指摘' };

function renderPrep(gate) {
  const g = GATE_BY_ID[gate];
  const high = curPrep.filter(p => p.level === 'high');
  const mid = curPrep.filter(p => p.level === 'mid');
  const std = curPrep.filter(p => p.level === 'std');

  $('#prepResult').innerHTML = `
    <div class="card" style="border-left:4px solid var(--color-primary)">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
        <span class="status status--done">絞り込み完了</span>
        <span class="cell-sub">${esc(g.id)} ${esc(g.name)}　／　実施予定 ${esc(g.date)}　／　${today()}</span>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--space-4);margin-bottom:var(--space-4)">
        <div><p class="kpi__label">標準の確認項目</p><p class="kpi__value" style="font-size:var(--font-section-title)">${curPrep.length}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">重点確認</p><p class="kpi__value" style="font-size:var(--font-section-title);color:var(--color-error)">${high.length}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">確認</p><p class="kpi__value" style="font-size:var(--font-section-title);color:var(--color-warning)">${mid.length}<span class="kpi__unit"> 件</span></p></div>
      </div>
      <p style="line-height:var(--line-height-body)">
        ${esc(g.id)}の標準確認項目 ${curPrep.length} 件に対し、今回の変更点・過去不具合・前回DRの指摘を突き合わせました。
        ${high.length} 件が重点確認、${mid.length} 件が確認、残り ${std.length} 件は突き合わせの結果が付かなかった標準項目です。
        <strong>標準項目もリストから削除していません。</strong>落とすかどうかは主査が判断してください。
      </p>
    </div>

    <div class="section">
      <h2 class="section__title">確認すべき項目</h2>
      <p class="section__lead">優先度の高い順に表示しています。各項目には、なぜ今回確認が必要かの根拠を付けています。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">確認すべき項目</caption>
          <thead><tr>
            <th scope="col">優先度</th><th scope="col">区分</th><th scope="col">確認項目</th>
            <th scope="col">今回確認が必要な理由</th><th scope="col">操作</th>
          </tr></thead>
          <tbody>${curPrep.map((p, i) => `
            <tr>
              <td class="nowrap">${LEVEL_LABEL[p.level]}</td>
              <td class="nowrap">${esc(p.item.cat)}<div class="cell-sub mono">${esc(p.item.id)}</div></td>
              <td class="col-text">${esc(p.item.item)}</td>
              <td class="col-text">${p.hits.length
                ? p.hits.map(h => `<div style="margin-bottom:var(--space-1)"><span class="libchip">${esc(KIND_LABEL[h.kind])}</span> ${esc(h.why)}</div>`).join('')
                : '<span class="cell-sub">突き合わせの結果は付きませんでした。標準項目として確認してください。</span>'}</td>
              <td class="nowrap">
                ${p.hits.length ? `<button class="btn btn--quiet btn--small" data-ev="${i}">根拠を確認する</button>` : ''}
                <button class="btn btn--quiet btn--small" data-raise="${i}">指摘として起票する</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);flex-wrap:wrap">
        <button class="btn btn--primary" id="btnPrepCsv">審査シートをExcelで出力する</button>
      </div>
    </div>

    <div class="callout callout--warn">
      <div>
        <p class="callout__title">この結果を使うときの注意</p>
        <p>優先度は突き合わせの結果による並び替えであり、確認の要否を決めるものではありません。標準の確認項目は1件も削除していません。試験成績書が未登録のため、評価区分の項目は実績との突き合わせができていません。</p>
      </div>
    </div>`;

  $('#btnPrepCsv').addEventListener('click', () => {
    downloadCsv(`DR審査シート_${gate}_${today()}.csv`, [
      ['優先度', '項目番号', '区分', '確認項目', '今回確認が必要な理由', '突き合わせ元'],
      ...curPrep.map(p => [
        p.level === 'high' ? '重点確認' : p.level === 'mid' ? '確認' : '標準項目',
        p.item.id, p.item.cat, p.item.item,
        p.hits.map(h => h.why).join(' ／ '),
        p.hits.map(h => KIND_LABEL[h.kind]).join('・')
      ])
    ]);
    toast('審査シートを出力しました', `${curPrep.length} 件の確認項目を出力しました。`);
  });
}

/* ---- 根拠パネル ---- */
function openPrepEv(i) {
  const p = curPrep[i];
  if (!p) return;
  openPanel('根拠：' + p.item.item, `
    <dl class="meta-list">
      <dt>項目番号</dt><dd class="mono">${esc(p.item.id)}</dd>
      <dt>区分</dt><dd>${esc(p.item.cat)}</dd>
      <dt>優先度</dt><dd>${p.level === 'high' ? '重点確認' : p.level === 'mid' ? '確認' : '標準項目'}</dd>
    </dl>
    ${p.hits.map(h => {
      if (h.kind === 'change') return `
        <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">今回の変更点との対応</h3>
        <div class="quote">
          <p><strong>変更点</strong><br>${esc(h.rec.cp)}</p>
          <p style="margin-top:var(--space-2)"><strong>心配点</strong><br><mark>${esc(h.rec.worry)}</mark></p>
          <p style="margin-top:var(--space-2)"><strong>想定される故障モード</strong><br>${esc(h.rec.mode)}</p>
          <p style="margin-top:var(--space-2)"><strong>対策</strong><br>${esc(h.rec.act)}</p>
        </div>`;
      if (h.kind === 'trouble') return `
        <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">過去不具合との対応</h3>
        <div class="quote">
          <p><strong><span class="mono">${esc(h.rec.id)}</span>（${esc(h.rec.date)}・${esc(h.rec.prod)}）</strong></p>
          <p style="margin-top:var(--space-2)">${esc(h.rec.sym)}</p>
          <p style="margin-top:var(--space-2)"><strong>原因</strong><br>${esc(h.rec.cause)}</p>
          <p style="margin-top:var(--space-2)"><strong>恒久対策</strong><br>${esc(h.rec.perm)}</p>
        </div>`;
      return `
        <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">前回DR指摘との対応</h3>
        <div class="quote">
          <p><strong><span class="mono">${esc(h.rec.id)}</span>（${esc(h.rec.gate)}）</strong></p>
          <p style="margin-top:var(--space-2)"><mark>${esc(h.rec.item)}</mark></p>
          <p style="margin-top:var(--space-2)">担当：${esc(h.rec.by)}　期限：${esc(h.rec.due)}　状態：${esc(h.rec.status)}</p>
        </div>`;
    }).join('')}
    <p style="margin-top:var(--space-5);font-size:var(--font-caption);color:var(--color-text-secondary)">突き合わせは記載内容の一致度によるものです。実際に確認が必要かどうかは主査が判断してください。</p>`);
}

/* ---- 審査ゲート ---- */
function renderGates() {
  const open = findings.filter(f => f.status !== '完了');
  const kpis = [
    { label: '審査ゲート', value: DATA.DR_GATES.length, unit: ' 件', note: `完了 ${DATA.DR_GATES.filter(g => g.status === '完了').length} 件` },
    { label: '未完了の指摘', value: open.length, unit: ' 件', warn: true, note: `対応中 ${open.filter(f => f.status === '対応中').length} 件／未着手 ${open.filter(f => f.status === '未着手').length} 件` },
    { label: '次のゲート', value: 'DR3', unit: '', note: '詳細設計審査（2026-08-27 予定）' },
    { label: '標準の確認項目', value: (DATA.DR_CHECKLIST.DR3 || []).length, unit: ' 件', note: 'DR3の設計審査規程より' }
  ];
  $('#kpiGrid').innerHTML = kpis.map(k => `
    <div class="card">
      <p class="kpi__label">${esc(k.label)}</p>
      <p class="kpi__value"${k.warn ? ' style="color:var(--color-warning)"' : ''}>${esc(k.value)}<span class="kpi__unit">${esc(k.unit)}</span></p>
      <p class="kpi__note">${esc(k.note)}</p>
    </div>`).join('');

  $('#gateBody').innerHTML = DATA.DR_GATES.map(g => {
    const o = findings.filter(f => f.gate === g.id && f.status !== '完了').length;
    return `<tr>
      <td class="nowrap"><strong>${esc(g.id)}</strong><div class="cell-sub">${esc(g.name)}</div></td>
      <td class="nowrap mono">${esc(g.date)}</td>
      <td class="nowrap">${esc(g.chair)}</td>
      <td class="nowrap mono">${g.items ? g.items + ' 件' : '—'}</td>
      <td class="nowrap">${o ? `<span class="status status--warn">${o} 件</span>` : '<span class="cell-empty">—</span>'}</td>
      <td class="nowrap"><span class="status status--${g.status === '完了' ? 'done' : g.status === '準備中' ? 'warn' : 'todo'}">${esc(g.status)}</span></td>
      <td class="nowrap">${g.status === '準備中'
        ? '<button class="btn btn--quiet btn--small" data-goto="prep">審査準備を開く</button>'
        : '<span class="cell-empty">—</span>'}</td>
    </tr>`;
  }).join('');

  const carry = findings.filter(f => f.status !== '完了');
  $('#carryBody').innerHTML = carry.length ? carry.map(f => `
    <tr>
      <td class="mono nowrap">${esc(f.id)}</td>
      <td class="nowrap">${esc(f.cat)}</td>
      <td class="col-text">${esc(f.item)}</td>
      <td class="nowrap">${esc(f.by)}</td>
      <td class="mono nowrap">${esc(f.due)}</td>
      <td class="nowrap"><span class="status status--${f.status === '対応中' ? 'warn' : 'todo'}">${esc(f.status)}</span></td>
      <td class="nowrap">${f.link ? `<button class="btn btn--quiet btn--small" data-extr="${esc(f.link)}">関連記録を確認する</button>` : '<span class="cell-empty">—</span>'}</td>
    </tr>`).join('') : `<tr><td colspan="7" class="cell-empty">持ち越している指摘はありません</td></tr>`;
}

/* ---- 指摘事項 ---- */
function renderFindings() {
  const g = $('#fGate').value, s = $('#fStat').value;
  const rows = findings.filter(f => (!g || f.gate === g) && (!s || f.status === s));
  const cond = [];
  if (g) cond.push('ゲート=' + g);
  if (s) cond.push('状態=' + s);
  $('#findMeta').innerHTML = `全 ${findings.length} 件中 <strong>${rows.length} 件</strong>を表示`
    + (cond.length ? `　／　絞り込み中：${esc(cond.join('、'))}` : '');
  $('#findEmpty').hidden = rows.length > 0;
  $('#findBody').closest('.table-wrap').hidden = rows.length === 0;
  $('#findBody').innerHTML = rows.map(f => `
    <tr>
      <td class="mono nowrap">${esc(f.id)}</td>
      <td class="nowrap">${esc(f.gate)}</td>
      <td class="nowrap">${esc(f.cat)}</td>
      <td class="col-text">${esc(f.item)}</td>
      <td class="nowrap">${esc(f.by)}</td>
      <td class="mono nowrap">${esc(f.due)}</td>
      <td class="nowrap"><span class="status status--${f.status === '完了' ? 'done' : f.status === '対応中' ? 'warn' : 'todo'}">${esc(f.status)}</span></td>
      <td class="nowrap">${f.status !== '完了'
        ? `<button class="btn btn--quiet btn--small" data-close="${esc(f.id)}">完了にする</button>`
        : '<span class="cell-empty">—</span>'}</td>
    </tr>`).join('');
  return rows;
}

/* ---- 過去指摘の横展開 ---- */
function renderCarry() {
  const done = findings.filter(f => f.status === '完了');
  const cands = done.map(f => {
    const g = grams(f.item + ' ' + f.cat);
    let best = null, bs = 0;
    (DATA.DR_CHECKLIST.DR3 || []).forEach(c => {
      const s = dice(g, grams(c.item + ' ' + c.cat));
      if (s > bs) { bs = s; best = c; }
    });
    return { f, item: best, score: bs };
  }).filter(x => x.score >= 0.16).sort((a, b) => b.score - a.score);

  $('#carryMeta').textContent =
    `完了した過去指摘 ${done.length} 件のうち、DR3の確認項目と対応する ${cands.length} 件を表示しています`;

  $('#carryCards').innerHTML = cands.length ? cands.map((c, i) => `
    <div class="kcard" data-card="${i}">
      <div class="kcard__head">
        <h3 class="kcard__title">${esc(c.f.cat)}の観点</h3>
        <span class="status status--ai">横展開の候補</span>
        <span class="cell-sub mono">${esc(c.f.id)}（${esc(c.f.gate)}）</span>
      </div>
      <div class="kcard__body">
        <p><strong>過去の指摘</strong>　${esc(c.f.item)}</p>
        <p style="margin-top:var(--space-2)"><strong>DR3での対応項目</strong>　${esc(c.item.item)}<span class="cell-sub mono">（${esc(c.item.id)}）</span></p>
        <p style="margin-top:var(--space-2)" class="cell-sub">この指摘は完了していますが、同じ観点がDR3の確認項目にも含まれます。今回の機種でも同様の確認が必要かを判断してください。</p>
      </div>
      <div class="kcard__foot">
        <button class="btn btn--quiet btn--small" data-carryev="${i}">過去の指摘を確認する</button>
        <button class="btn btn--quiet btn--small" data-carryadd="${i}">DR3の重点確認に追加する</button>
      </div>
    </div>`).join('') : `
    <div class="empty">
      <h2 class="empty__title">横展開の候補は見つかりませんでした</h2>
      <div class="empty__body">
        <p>完了した過去指摘のうち、DR3の確認項目と対応するものはありません。範囲を広げる場合は、他機種のDR記録を取り込んでください。</p>
      </div>
    </div>`;
  return cands;
}

/* ---- 初期化 ---- */
wireShell();
renderGates();
renderFindings();
let carryCands = renderCarry();

DATA.DR_GATES.filter(g => DATA.DR_CHECKLIST[g.id]).forEach(g => {
  const o = document.createElement('option');
  o.value = g.id; o.textContent = `${g.id}　${g.name}`;
  $('#gateSelect').appendChild(o);
});
DATA.DR_GATES.forEach(g => {
  const o = document.createElement('option');
  o.value = g.id; o.textContent = g.id;
  $('#fGate').appendChild(o);
});
$('#gateSelect').value = 'DR3';

['#fGate', '#fStat'].forEach(s => $(s).addEventListener('change', renderFindings));

$('#prepForm').addEventListener('submit', e => {
  e.preventDefault();
  const gate = $('#gateSelect').value;
  if (!gate) {
    $('#gateError').hidden = false;
    $('#gateSelect').setAttribute('aria-invalid', 'true');
    toast('対象ゲートを選択してください', 'ゲートを選ぶと、標準の確認項目を突き合わせられます。', 'error');
    return;
  }
  $('#gateError').hidden = true;
  $('#gateSelect').removeAttribute('aria-invalid');
  $('#prepIdle').hidden = true;
  $('#prepResult').hidden = true;
  $('#prepLoading').hidden = false;
  $('#prepLoadMeta').textContent =
    `対象：${gate}　／　標準の確認項目 ${(DATA.DR_CHECKLIST[gate] || []).length} 件　／　変更点 ${DATA.DRBFM.length} 件・不具合記録 ${DATA.TROUBLE_TOTAL.toLocaleString()} 件と突き合わせます`;
  runSteps('#prepStepper', () => {
    curPrep = buildPrep(gate);
    $('#prepLoading').hidden = true;
    renderPrep(gate);
    $('#prepResult').hidden = false;
  }, 320);
});

$('#btnFindCsv').addEventListener('click', () => {
  const rows = renderFindings();
  downloadCsv(`DR指摘事項_${today()}.csv`, [
    ['指摘番号', 'ゲート', '区分', '指摘内容', '担当', '期限', '状態', '関連記録'],
    ...rows.map(f => [f.id, f.gate, f.cat, f.item, f.by, f.due, f.status, f.link || ''])
  ]);
  toast('CSVを出力しました', `${rows.length} 件の指摘を出力しました。`);
});

document.addEventListener('click', e => {
  const ev = e.target.closest('[data-ev]');
  if (ev) { openPrepEv(Number(ev.dataset.ev)); return; }

  const raise = e.target.closest('[data-raise]');
  if (raise) {
    const p = curPrep[Number(raise.dataset.raise)];
    if (!p) return;
    const id = `DR3-${String(findings.filter(f => f.gate === 'DR3').length + 20).padStart(2, '0')}`;
    findings.push({ id, gate: 'DR3', cat: p.item.cat, item: p.item.item,
      by: '技術部 森', due: '2026-08-25', status: '未着手',
      link: p.hits.find(h => h.kind === 'trouble') ? p.hits.find(h => h.kind === 'trouble').rec.id : '' });
    renderGates(); renderFindings();
    toast('指摘として起票しました', `${id}　担当と期限は仮置きです。指摘事項の画面で修正できます。`);
    return;
  }

  const cl = e.target.closest('[data-close]');
  if (cl) {
    const f = findings.find(x => x.id === cl.dataset.close);
    if (!f) return;
    f.status = '完了';
    renderGates(); renderFindings(); carryCands = renderCarry();
    toast('指摘を完了にしました', `${f.id}　完了した指摘は、次の機種の横展開候補になります。`);
    return;
  }

  const ce = e.target.closest('[data-carryev]');
  if (ce) {
    const c = carryCands[Number(ce.dataset.carryev)];
    if (!c) return;
    openPanel('過去の指摘：' + c.f.id, `
      <dl class="meta-list">
        <dt>指摘番号</dt><dd class="mono">${esc(c.f.id)}</dd>
        <dt>ゲート</dt><dd>${esc(c.f.gate)}　${esc(GATE_BY_ID[c.f.gate] ? GATE_BY_ID[c.f.gate].name : '')}</dd>
        <dt>区分 ／ 担当</dt><dd>${esc(c.f.cat)}　／　${esc(c.f.by)}</dd>
        <dt>状態</dt><dd>${esc(c.f.status)}</dd>
      </dl>
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">指摘の内容</h3>
      <div class="quote"><p><mark>${esc(c.f.item)}</mark></p></div>
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">DR3で対応する確認項目</h3>
      <div class="quote"><p><span class="mono">${esc(c.item.id)}</span>　${esc(c.item.item)}</p></div>
      ${c.f.link && TR_BY_ID[c.f.link] ? `
        <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">指摘の背景にある不具合</h3>
        <div class="quote">
          <p><strong><span class="mono">${esc(c.f.link)}</span>（${esc(TR_BY_ID[c.f.link].date)}）</strong></p>
          <p style="margin-top:var(--space-2)">${esc(TR_BY_ID[c.f.link].sym)}</p>
        </div>` : ''}`);
    return;
  }

  const ca = e.target.closest('[data-carryadd]');
  if (ca) {
    const c = carryCands[Number(ca.dataset.carryadd)];
    if (!c) return;
    const card = ca.closest('.kcard');
    card.dataset.state = 'approved';
    card.querySelector('.status').outerHTML = '<span class="status status--done">DR3へ追加済み</span>';
    toast('DR3の重点確認に追加しました', `${c.item.id}　${c.item.item}`);
    return;
  }

  const et = e.target.closest('[data-extr]');
  if (et) {
    const t = TR_BY_ID[et.dataset.extr];
    if (!t) return;
    openPanel('関連記録：' + t.id, `
      <dl class="meta-list">
        <dt>管理番号</dt><dd class="mono">${esc(t.id)}</dd>
        <dt>発生日 ／ 製品</dt><dd class="mono">${esc(t.date)}　${esc(t.prod)}</dd>
      </dl>
      <div class="quote" style="margin-top:var(--space-4)">
        <p><strong>発生事象</strong><br>${esc(t.sym)}</p>
        <p style="margin-top:var(--space-3)"><strong>原因</strong><br>${esc(t.cause)}</p>
        <p style="margin-top:var(--space-3)"><strong>恒久対策</strong><br>${esc(t.perm)}</p>
      </div>`);
  }
});
