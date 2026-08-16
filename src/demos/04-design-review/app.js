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

/* ---- 完了済みとされた指摘の見落とし検出 ----
   完了にした指摘は、以後の確認対象から外れる。ここが設計審査の穴になる。
   完了の判断より後に設計変更が入っていれば、その判断は変更前の条件で出したものになる。
   完了指摘 → 根拠となった不具合 → 同じ不具合を理由とする設計変更 の順にたどり、
   完了期限より後に発行された変更があるものを、再確認が必要な指摘として拾う。
   さらに、その観点が今回のDR3の指摘一覧に立っているかどうかを確認する。 */
function detectMissed() {
  const sw = $('#mxDone');
  if (sw && !sw.checked) return { checked: 0, out: [], off: true };
  const done = findings.filter(f => f.status === '完了' && f.link);
  const out = [];
  done.forEach(f => {
    DATA.ECNS.filter(e => e.src === f.link && e.date > f.due).forEach(ecn => {
      const g = grams(f.item + ' ' + f.cat);
      let cov = null, cs = 0;
      findings.filter(x => x.gate === 'DR3').forEach(x => {
        const s = dice(g, grams(x.item + ' ' + x.cat));
        if (s > cs) { cs = s; cov = x; }
      });
      let ci = null, is = 0;
      (DATA.DR_CHECKLIST.DR3 || []).forEach(c => {
        const s = dice(g, grams(c.item + ' ' + c.cat));
        if (s > is) { is = s; ci = c; }
      });
      out.push({
        f, ecn, item: ci, tr: TR_BY_ID[f.link],
        covered: cs >= 0.30, cover: cs >= 0.30 ? cov : null,
        piggy: (ecn.piggy || []).map(p => DATA.ECNS.find(e => e.no === p)).filter(Boolean)
      });
    });
  });
  return { checked: done.length, out };
}

let missed = { checked: 0, out: [] };

function renderMissed() {
  missed = detectMissed();
  const n = missed.out.length;
  if (missed.off) {
    $('#missMeta').textContent = '審査準備の画面で「完了済みとされた指摘」の突き合わせを外しているため、確認していません。';
    $('#missCards').innerHTML = `
      <div class="empty">
        <h2 class="empty__title">完了済みとされた指摘は確認していません</h2>
        <div class="empty__body"><p>審査準備の画面で突き合わせる情報に「完了済みとされた指摘」を含めると、ここに結果が出ます。</p></div>
      </div>`;
    return;
  }
  $('#missMeta').innerHTML = n
    ? `完了済みとされた指摘 ${missed.checked} 件をたどり、<strong>${n} 件</strong>について、完了と判断した後に設計変更が入っていることを確認しました。`
      + `完了扱いのままだとDR3の確認対象から外れます。`
    : `完了済みとされた指摘 ${missed.checked} 件をたどりましたが、完了の判断より後に入った設計変更はありませんでした。`;

  $('#missCards').innerHTML = n ? missed.out.map((m, i) => `
    <div class="kcard" data-misscard="${i}" style="border-left:4px solid var(--color-error)">
      <div class="kcard__head">
        <h3 class="kcard__title">${esc(m.f.cat)}の観点が、変更後の条件で確認されていません</h3>
        <span class="status status--risk">再確認が必要</span>
        <span class="cell-sub mono">${esc(m.f.id)}（${esc(m.f.gate)}）</span>
      </div>
      <div class="kcard__body">
        <p><strong>完了にした指摘</strong>　${esc(m.f.item)}</p>
        <p style="margin-top:var(--space-2)" class="cell-sub">担当 ${esc(m.f.by)}　／　期限 <span class="mono">${esc(m.f.due)}</span> で完了</p>
        <p style="margin-top:var(--space-3)"><strong>その後に入った設計変更</strong>　<span class="mono">${esc(m.ecn.no)}</span>（<span class="mono">${esc(m.ecn.date)}</span>・${esc(m.ecn.stage)}）${esc(m.ecn.title)}</p>
        <p style="margin-top:var(--space-3)"><mark>完了の判断は ${esc(m.f.due)} 時点のものです。${esc(m.ecn.date)} の設計変更で対象そのものが変わっているため、この判断は変更前の条件に対するものになります。</mark></p>
        <p style="margin-top:var(--space-3)" class="cell-sub">${m.covered
          ? `DR3の指摘 <span class="mono">${esc(m.cover.id)}</span> が同じ観点に当たります。内容が変更後の条件を含んでいるか確認してください。`
          : `DR3の指摘一覧に、この観点に当たる項目はありません。標準の確認項目では <span class="mono">${esc(m.item.id)}</span>「${esc(m.item.item)}」が対応します。`}</p>
      </div>
      <div class="kcard__foot">
        <button class="btn btn--quiet btn--small" data-missev="${i}">たどった経路を確認する</button>
        ${m.covered ? '' : `<button class="btn btn--quiet btn--small" data-missraise="${i}">DR3の指摘として起票する</button>`}
      </div>
    </div>`).join('') : `
    <div class="empty">
      <h2 class="empty__title">再確認が必要な指摘はありません</h2>
      <div class="empty__body">
        <p>完了済みとされた指摘について、完了と判断した後に入った設計変更はありませんでした。</p>
      </div>
    </div>`;
}

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
        <div><p class="kpi__label">重点確認</p><p class="kpi__value" style="font-size:var(--font-section-title)">${high.length}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">確認</p><p class="kpi__value" style="font-size:var(--font-section-title)">${mid.length}<span class="kpi__unit"> 件</span></p></div>
      </div>
      <p style="line-height:var(--line-height-body)">
        ${esc(g.id)}の標準確認項目 ${curPrep.length} 件に対し、今回の変更点・過去不具合・前回DRの指摘を突き合わせました。
        ${high.length} 件が重点確認、${mid.length} 件が確認、残り ${std.length} 件は突き合わせの結果が付かなかった標準項目です。
        <strong>標準項目もリストから削除していません。</strong>除外するかどうかは主査が判断してください。
      </p>
    </div>

    ${missed.out.length ? `
    <div class="section">
      <h2 class="section__title">完了済みとされた指摘に、再確認が必要なものがあります</h2>
      <p class="section__lead">完了にした指摘は確認対象から外れます。完了と判断した後に設計変更が入っているものを ${missed.out.length} 件見つけました。</p>
      ${missed.out.map((m, i) => `
        <div class="callout callout--error">
          <div>
            <p class="callout__title">${esc(m.f.id)}　${esc(m.f.item)}</p>
            <p>期限 ${esc(m.f.due)} で完了としていますが、${esc(m.ecn.date)} に <span class="mono">${esc(m.ecn.no)}</span>「${esc(m.ecn.title)}」が発行されています。完了の判断は変更前の条件に対するものです。</p>
            <p style="margin-top:var(--space-2)">
              <button class="btn btn--quiet btn--small" data-missev="${i}">たどった経路を確認する</button>
            </p>
          </div>
        </div>`).join('')}
    </div>` : ''}

    <div class="section">
      <h2 class="section__title">確認すべき項目</h2>
      <p class="section__lead">確認区分の重い順に表示しています。各項目には、なぜ今回確認が必要かの根拠を付けています。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">確認すべき項目</caption>
          <thead><tr>
            <th scope="col">確認区分</th><th scope="col">区分</th><th scope="col">確認項目</th>
            <th scope="col">今回確認が必要な理由</th><th scope="col">操作</th>
          </tr></thead>
          <tbody>${curPrep.map((p, i) => `
            <tr>
              <td class="nowrap">${LEVEL_LABEL[p.level]}</td>
              <td class="nowrap">${esc(p.item.cat)}<div class="cell-sub mono">${esc(p.item.id)}</div></td>
              <td class="col-text">${esc(p.item.item)}</td>
              <td class="col-text">${p.hits.length
                ? p.hits.map(h => `<div style="margin-bottom:var(--space-1)"><span class="libchip">${esc(KIND_LABEL[h.kind])}</span> ${esc(h.why)}</div>`).join('')
                : '<span class="cell-sub">関連情報との一致は確認できませんでした。標準項目として確認してください。</span>'}</td>
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
        <p>確認区分は突き合わせの結果による並び替えであり、確認の要否を決めるものではありません。標準の確認項目は1件も削除していません。試験成績書が未登録のため、評価区分の項目は実績との突き合わせができていません。</p>
      </div>
    </div>`;

  $('#btnPrepCsv').addEventListener('click', () => {
    downloadXlsx(`DR審査シート_${gate}_${today()}.xlsx`, [
      ['確認区分', '項目番号', '区分', '確認項目', '今回確認が必要な理由', '突き合わせ元'],
      ...missed.out.map(m => ['再確認が必要', m.item.id, m.f.cat, m.item.item,
        `${m.f.id} を ${m.f.due} で完了としているが、${m.ecn.date} に ${m.ecn.no}（${m.ecn.title}）が発行されている`,
        '完了済みとされた指摘']),
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
      <dt>確認区分</dt><dd>${p.level === 'high' ? '重点確認' : p.level === 'mid' ? '確認' : '標準項目'}</dd>
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
    ${sheetShot('dr', '設計審査記録 DR3（ACT-230 詳細設計審査）',
       '標準の確認項目は、この帳票の該当行から読み込んでいます。')}
    <p style="margin-top:var(--space-5);font-size:var(--font-caption)">突き合わせは記載内容の一致度によるものです。実際に確認が必要かどうかは主査が判断してください。</p>`);
}

/* ---- 審査ゲート ---- */
function renderGates() {
  const open = findings.filter(f => f.status !== '完了');
  const kpis = [
    { label: '審査ゲート', value: DATA.DR_GATES.length, unit: ' 件', note: `完了 ${DATA.DR_GATES.filter(g => g.status === '完了').length} 件` },
    { label: '未完了の指摘', value: open.length, unit: ' 件', warn: true, note: `対応中 ${open.filter(f => f.status === '対応中').length} 件／未着手 ${open.filter(f => f.status === '未着手').length} 件` },
    { label: '完了扱いだが再確認が必要', value: missed.off ? '—' : missed.out.length, unit: missed.off ? '' : ' 件',
      risk: !missed.off && missed.out.length > 0,
      note: missed.off ? '審査準備で突き合わせ対象から外しています'
                       : `完了後に設計変更が入った指摘（完了扱い ${missed.checked} 件を確認）` },
    { label: '標準の確認項目', value: (DATA.DR_CHECKLIST.DR3 || []).length, unit: ' 件', note: 'DR3の設計審査規程より' }
  ];
  $('#kpiGrid').innerHTML = kpis.map(k => `
    <div class="card">
      <p class="kpi__label">${k.warn || k.risk ? `<span class="kpi__dot kpi__dot--${k.risk ? 'risk' : 'warn'}"></span>` : ''}${esc(k.label)}</p>
      <p class="kpi__value">${esc(k.value)}<span class="kpi__unit">${esc(k.unit)}</span></p>
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
      <td class="nowrap">${f.link ? `<button class="btn btn--quiet btn--small" data-extr="${esc(f.link)}">関連記録を確認する</button>` : '<span class="cell-empty">—</span>'}</td>
    </tr>`).join('') : `<tr><td colspan="7" class="cell-empty">持ち越している指摘はありません</td></tr>`;
}

/* ---- 指摘事項 ---- */
function renderFindings() {
  const g = $('#fGate').value, s = '';
  const rows = findings.filter(f => (!g || f.gate === g) && (!s || f.status === s));
  const cond = [];
  if (g) cond.push('ゲート=' + g);
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
renderMissed();
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

$('#fGate').addEventListener('change', renderFindings);

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
    renderMissed();
    renderGates();
    $('#prepLoading').hidden = true;
    renderPrep(gate);
    $('#prepResult').hidden = false;
  }, 320);
});

$('#btnFindCsv').addEventListener('click', () => {
  const rows = renderFindings();
  downloadXlsx(`DR指摘事項_${today()}.xlsx`, [
    ['指摘番号', 'ゲート', '区分', '指摘内容', '担当', '期限', '状態', '関連記録'],
    ...rows.map(f => [f.id, f.gate, f.cat, f.item, f.by, f.due, f.status, f.link || ''])
  ]);
  toast('Excelを出力しました', `${rows.length} 件の指摘を出力しました。`);
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
    renderMissed(); renderGates(); renderFindings();
    toast('指摘として起票しました', `${id}　担当と期限は仮置きです。指摘事項の画面で修正できます。`);
    return;
  }

  const cl = e.target.closest('[data-close]');
  if (cl) {
    const f = findings.find(x => x.id === cl.dataset.close);
    if (!f) return;
    f.status = '完了';
    renderMissed(); renderGates(); renderFindings(); carryCands = renderCarry();
    toast('指摘を完了にしました', `${f.id}　完了した指摘は、次の機種の横展開候補になります。`);
    return;
  }

  const me = e.target.closest('[data-missev]');
  if (me) {
    const m = missed.out[Number(me.dataset.missev)];
    if (!m) return;
    openPanel('たどった経路：' + m.f.id, `
      <p style="line-height:var(--line-height-body)">完了済みとされた指摘から、根拠となった不具合記録、その不具合を理由とする設計変更の順にたどりました。日付の前後関係だけで判定しています。</p>
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">1. 完了にした指摘</h3>
      <div class="quote">
        <p><strong><span class="mono">${esc(m.f.id)}</span>（${esc(m.f.gate)}　${esc(m.f.cat)}）</strong></p>
        <p style="margin-top:var(--space-2)">${esc(m.f.item)}</p>
        <p style="margin-top:var(--space-2)">担当：${esc(m.f.by)}　期限：<span class="mono">${esc(m.f.due)}</span>　状態：完了</p>
      </div>
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">2. 指摘の根拠になった不具合</h3>
      <div class="quote">
        <p><strong><span class="mono">${esc(m.tr.id)}</span>（${esc(m.tr.date)}・${esc(m.tr.prod)}）</strong></p>
        <p style="margin-top:var(--space-2)">${esc(m.tr.sym)}</p>
        <p style="margin-top:var(--space-2)"><strong>恒久対策</strong><br>${esc(m.tr.perm)}</p>
      </div>
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">3. 同じ不具合を理由とする設計変更</h3>
      <div class="quote">
        <p><strong><span class="mono">${esc(m.ecn.no)}</span>（発行 ${esc(m.ecn.date)}・${esc(m.ecn.stage)}版・${esc(m.ecn.status)}）</strong></p>
        <p style="margin-top:var(--space-2)">${esc(m.ecn.title)}</p>
        <p style="margin-top:var(--space-2)"><strong>変更理由</strong><br>${esc(m.ecn.reason)}</p>
        ${m.piggy.length ? `<p style="margin-top:var(--space-2)"><strong>関連変更変更</strong><br>${m.piggy.map(x => `<span class="mono">${esc(x.no)}</span>　${esc(x.title)}`).join('<br>')}</p>` : ''}
      </div>
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">4. 判定</h3>
      <div class="quote">
        <p><mark>完了期限 ${esc(m.f.due)} ＜ 設計変更の発行日 ${esc(m.ecn.date)}</mark></p>
        <p style="margin-top:var(--space-2)">完了と判断した時点では、この設計変更はまだ入っていません。指摘で確認した内容は変更前の条件に対するものです。</p>
      </div>
      ${sheetShot('dr', '設計審査記録 DR3（ACT-230 詳細設計審査）',
         '指摘の状態と期限は、この帳票の指摘事項欄から読み込んでいます。')}
      <p style="margin-top:var(--space-5);font-size:var(--font-caption)">この判定は日付と根拠記録のつながりによるものです。実際に再確認が必要かどうかは主査が判断してください。設計変更の内容が指摘の確認範囲に影響しない場合もあります。</p>`);
    return;
  }

  const mr = e.target.closest('[data-missraise]');
  if (mr) {
    const m = missed.out[Number(mr.dataset.missraise)];
    if (!m) return;
    const id = `DR3-${String(findings.filter(f => f.gate === 'DR3').length + 20).padStart(2, '0')}`;
    findings.push({ id, gate: 'DR3', cat: m.f.cat,
      item: `${m.f.item}（${m.ecn.no} の変更後の条件で再確認すること。${m.f.id} は変更前の条件で完了としている）`,
      by: m.f.by, due: '2026-08-25', status: '未着手', link: m.f.link });
    renderMissed(); renderGates(); renderFindings();
    toast('DR3の指摘として起票しました', `${id}　${m.f.id} を引き継いだ指摘です。担当と期限は仮置きです。`);
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

/* ===== レビュー観点の抽出 =====================================
   ここがこのデモの入口。過去のDR議事録を読ませて、
   過去のDRで繰り返し指摘された観点を、チェックリストの項目として整理する。
   そのあと今回の帳票を読ませて、その項目に沿った指摘を出す。 */

const PAST_SAMPLE = [
  { k: '対象機種', v: 'ACT-180／ACT-190／ACT-210／ACT-215／ACT-220' },
  { k: '対象ゲート', v: 'DR1〜DR4' },
  { k: '発言の件数', v: DATA.DR_PAST.length + ' 件' }
];
const DOC_SAMPLE = [
  { k: '対象機種', v: 'ACT-230（新機種）' },
  { k: '対象ゲート', v: 'DR3 詳細設計審査（2026-08-27）' },
  { k: '読み取る欄', v: '注記・材質・変更内容・評価計画' }
];

let checklistMade = false;

function readoutHtml(rows) {
  return `<dl class="kv" style="margin-top:var(--space-3)">`
    + rows.map(r => `<dt>${esc(r.k)}</dt><dd>${esc(r.v)}</dd>`).join('')
    + `</dl>`;
}

/* 議事録を観点ごとに束ねる。2回以上出たものだけを項目にする。 */
function groupPast() {
  const groups = DATA.DR_THEMES.map(t => ({
    t, says: DATA.DR_PAST.filter(p => p.theme === t.key)
  })).filter(g => g.says.length >= 2);
  const singles = DATA.DR_PAST.filter(p => !p.theme);
  return { groups, singles };
}

function runPast() {
  $('#pastIdle').hidden = true;
  $('#pastResult').hidden = true;
  $('#pastLoading').hidden = false;
  $('#pastLoadMeta').textContent =
    `${DATA.DR_PAST.length}件の発言／5機種／DR1〜DR4`;
  runSteps('#pastStepper', () => {
    $('#pastLoading').hidden = true;
    renderPast();
    $('#pastResult').hidden = false;
    checklistMade = true;
    $('#sec2').hidden = false;
    toast('チェックリスト候補を作成しました', `${groupPast().groups.length} 項目を起こしました。`);
  });
}

function renderPast() {
  const { groups, singles } = groupPast();
  const total = groups.reduce((a, g) => a + g.says.length, 0);

  $('#pastResult').innerHTML = `
    <div class="card" style="border-left:4px solid var(--color-primary);margin-bottom:var(--space-5)">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
        <span class="status status--ai">過去のDRから抽出しました</span>
        <span class="cell-sub">${DATA.DR_PAST.length}件の発言を読み、${total}件が${groups.length}つの観点にまとまりました</span>
      </div>
      <p style="line-height:var(--line-height-body)">
        同じことを別の言い方で繰り返し言っている発言が ${total} 件ありました。これを ${groups.length} つの観点にまとめ、
        チェックリストの項目に書き直しています。出現が1回の ${singles.length} 件は、まとめずに確認候補として残しています。
      </p>
    </div>

    ${groups.map((g, i) => {
      const prods = [...new Set(g.says.map(s => s.prod))];
      const people = [...new Set(g.says.map(s => s.by))];
      return `
      <div class="card" style="margin-bottom:var(--space-4)">
        <div style="display:flex;align-items:flex-start;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
          <span class="status status--done">${esc(g.t.cat)}</span>
          <span class="status status--warn">${g.says.length} 回</span>
          <span class="cell-sub">${esc(prods.join('・'))}　／　${esc(people.join('・'))}</span>
        </div>
        <h3 style="font-size:var(--font-subsection-title);margin-bottom:var(--space-2)">${esc(g.t.item)}</h3>
        <p style="font-size:var(--font-caption);color:var(--color-text-secondary);line-height:var(--line-height-body);margin-bottom:var(--space-4)">${esc(g.t.why)}</p>
        <details>
          <summary>もとの発言 ${g.says.length} 件を見る</summary>
          <div style="margin-top:var(--space-3)">
            ${g.says.map(s => `
              <blockquote class="quote" style="margin-bottom:var(--space-3)">
                <p>${esc(s.say)}</p>
                <footer class="cell-sub" style="margin-top:var(--space-2)">
                  ${esc(s.id)}　${esc(s.date)}　${esc(s.prod)}　${esc(s.dr)}　${esc(s.by)}
                </footer>
              </blockquote>`).join('')}
          </div>
        </details>
        <div style="margin-top:var(--space-4);display:flex;gap:var(--space-3);flex-wrap:wrap">
          <button class="btn btn--secondary btn--small" data-adopt="${i}">この項目を採用する</button>
          <button class="btn btn--quiet btn--small" data-drop="${i}">今回は使わない</button>
        </div>
      </div>`;
    }).join('')}

    <div class="section">
      <h2 class="section__title">単発の指摘（確認候補として保持）</h2>
      <p class="section__lead">出現が1回のため、チェックリスト項目にはまとめていません。除外はしていないので、重要かどうかは担当者が確認してください。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">項目にしなかった発言</caption>
          <thead><tr>
            <th scope="col">記録</th><th scope="col">機種</th><th scope="col">発言者</th><th scope="col">発言</th>
          </tr></thead>
          <tbody>${singles.map(s => `
            <tr>
              <td class="mono nowrap">${esc(s.id)}<div class="cell-sub">${esc(s.date)}</div></td>
              <td class="nowrap">${esc(s.prod)}<div class="cell-sub">${esc(s.dr)}</div></td>
              <td class="nowrap">${esc(s.by)}</td>
              <td class="col-text">${esc(s.say)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="callout callout--warn" style="margin-top:var(--space-5)">
      <div>
        <p class="callout__title">この結果の見方</p>
        <p>繰り返し指摘されている観点は、標準的な確認項目として有効な可能性があります。指摘回数だけで重要度を判断せず、採用可否は担当者が確認してください。チェックリスト文はAIが標準化した案です。社内用語や表現に合わせて確認・修正してください。</p>
      </div>
    </div>

    <div style="margin-top:var(--space-5);display:flex;gap:var(--space-3);flex-wrap:wrap">
      <button class="btn btn--primary" id="btnChkCsv">チェックリストをExcelで出力する</button>
      <button class="btn btn--quiet" data-goto="prep">審査準備に進む</button>
    </div>`;
}

/* ---- 取り込んだ帳票から指摘を出す ---- */
function runDoc() {
  $('#docIdle').hidden = true;
  $('#docResult').hidden = true;
  $('#docLoading').hidden = false;
  const { groups } = groupPast();
  $('#docLoadMeta').textContent = `2ファイル／チェックリスト ${groups.length} 項目と突き合わせ`;
  runSteps('#docStepper', () => {
    $('#docLoading').hidden = true;
    renderDoc();
    $('#docResult').hidden = false;
    const n = DATA.DR_INTAKE_HITS.filter(h => h.sev !== 'open').length;
    toast('指摘を出しました', `${n} 件の指摘と、確認できなかった項目 ${DATA.DR_INTAKE_HITS.length - n} 件です。`);
  });
}

const SEV_LABEL = {
  high: '<span class="status status--risk">重点確認候補</span>',
  mid: '<span class="status status--warn">確認</span>',
  open: '<span class="status status--todo">確認できず</span>'
};

function renderDoc() {
  const TH = {}; DATA.DR_THEMES.forEach(t => TH[t.key] = t);
  const hits = DATA.DR_INTAKE_HITS;
  const real = hits.filter(h => h.sev !== 'open');
  const open = hits.filter(h => h.sev === 'open');

  $('#docResult').innerHTML = `
    <div class="card" style="border-left:4px solid var(--color-primary);margin-bottom:var(--space-5)">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
        <span class="status status--ai">帳票から出した指摘</span>
        <span class="cell-sub">図面 ACT-230-300 RevA ／ 変更発議書 ACT-230 2026-07-01</span>
      </div>
      <p style="line-height:var(--line-height-body)">
        チェックリスト ${hits.length} 項目のうち、${real.length} 項目で記載が足りていませんでした。
        ${open.length} 項目は、対応する記載を帳票の中に見つけられませんでした。
        いずれもDRの場で確認する材料であり、可否の判断はしていません。
      </p>
    </div>

    ${hits.map((h, i) => {
      const t = TH[h.theme];
      const says = DATA.DR_PAST.filter(p => p.theme === h.theme);
      return `
      <div class="card" style="margin-bottom:var(--space-4);border-left:4px solid var(--color-${h.sev === 'high' ? 'error' : h.sev === 'mid' ? 'warning' : 'border'})">
        <div style="display:flex;align-items:flex-start;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
          ${SEV_LABEL[h.sev]}
          <span class="status status--todo">${esc(t.cat)}</span>
          <span class="cell-sub">${esc(h.doc)}${h.where !== '—' ? '　' + esc(h.where) : ''}</span>
        </div>
        <h3 style="font-size:var(--font-subsection-title);margin-bottom:var(--space-3)">${esc(t.item)}</h3>

        <div style="display:grid;gap:var(--space-3)">
          <div>
            <p style="font-size:var(--font-caption);color:var(--color-text-secondary);margin-bottom:var(--space-1)">帳票の記載</p>
            <blockquote class="quote"><p>${esc(h.found)}</p></blockquote>
          </div>
          <div>
            <p style="font-size:var(--font-caption);color:var(--color-text-secondary);margin-bottom:var(--space-1)">足りないと判断した理由</p>
            <p style="line-height:var(--line-height-body)">${esc(h.ng)}</p>
          </div>
          <div>
            <p style="font-size:var(--font-caption);color:var(--color-text-secondary);margin-bottom:var(--space-1)">DRで求めること</p>
            <p style="line-height:var(--line-height-body)"><strong>${esc(h.ask)}</strong></p>
          </div>
        </div>

        ${says.length ? `
        <details style="margin-top:var(--space-4)">
          <summary>この項目のもとになった過去の発言 ${says.length} 件</summary>
          <div style="margin-top:var(--space-3)">
            ${says.map(s => `
              <blockquote class="quote" style="margin-bottom:var(--space-3)">
                <p>${esc(s.say)}</p>
                <footer class="cell-sub" style="margin-top:var(--space-2)">${esc(s.id)}　${esc(s.date)}　${esc(s.prod)}　${esc(s.by)}</footer>
              </blockquote>`).join('')}
          </div>
        </details>` : ''}

        <div style="margin-top:var(--space-4);display:flex;gap:var(--space-3);flex-wrap:wrap">
          <button class="btn btn--secondary btn--small" data-raise="${i}">指摘として起票する</button>
          <button class="btn btn--quiet btn--small" data-skip="${i}">起票しない</button>
        </div>
      </div>`;
    }).join('')}

    <div class="callout callout--warn" style="margin-top:var(--space-5)">
      <div>
        <p class="callout__title">この結果の見方</p>
        <p>「確認できず」は、記載がないという意味ではありません。取り込んだ帳票の中に見つけられなかっただけで、別の文書に書いてある可能性があります。記載なしとして扱わないでください。</p>
      </div>
    </div>

    <div style="margin-top:var(--space-5)">
      <button class="btn btn--primary" id="btnHitCsv">指摘をExcelで出力する</button>
    </div>`;
}

/* ---- 配線 ---- */
wireDrop({
  file: '#pastFile', sample: '#btnPastSample', readout: '#pastReadout',
  sampleName: '設計審査議事録_2021-2024（12ファイル）', rows: PAST_SAMPLE,
  onRead: () => { $('#btnPastRun').disabled = false; }
});
wireDrop({
  file: '#docFile', sample: '#btnDocSample', readout: '#docReadout',
  sampleName: '図面 ACT-230-300 RevA ほか1件', rows: DOC_SAMPLE,
  onRead: () => { $('#btnDocRun').disabled = false; }
});
$('#btnPastRun').addEventListener('click', runPast);
$('#btnDocRun').addEventListener('click', runDoc);

document.addEventListener('click', e => {
  const ad = e.target.closest('#pastResult [data-adopt]');
  if (ad) {
    const { groups } = groupPast();
    const g = groups[Number(ad.dataset.adopt)];
    ad.closest('.card').style.background = 'var(--color-success-bg)';
    ad.closest('.card').style.borderColor = 'var(--color-success-line)';
    ad.textContent = '採用しました';
    ad.disabled = true;
    toast('項目を採用しました', esc(g.t.item));
    return;
  }
  const dr = e.target.closest('#pastResult [data-drop]');
  if (dr) {
    dr.closest('.card').style.opacity = '.5';
    dr.textContent = '今回は採用しない';
    dr.disabled = true;
    return;
  }
  const rz = e.target.closest('#docResult [data-raise]');
  if (rz) {
    const h = DATA.DR_INTAKE_HITS[Number(rz.dataset.raise)];
    const TH = {}; DATA.DR_THEMES.forEach(t => TH[t.key] = t);
    rz.closest('.card').style.background = 'var(--color-success-bg)';
    rz.textContent = '起票しました';
    rz.disabled = true;
    toast('指摘を起票しました', TH[h.theme].item);
    return;
  }
  const sk = e.target.closest('#docResult [data-skip]');
  if (sk) {
    sk.closest('.card').style.opacity = '.5';
    sk.textContent = '起票しません';
    sk.disabled = true;
    return;
  }
  if (e.target.id === 'btnChkCsv') {
    const { groups } = groupPast();
    downloadXlsx(`DRチェックリスト_${today()}.xlsx`, [
      ['区分', 'チェック項目', '過去の指摘回数', '対象機種', '起こしたもとの記録'],
      ...groups.map(g => [g.t.cat, g.t.item, g.says.length,
        [...new Set(g.says.map(s => s.prod))].join('・'), g.says.map(s => s.id).join(' ')])
    ]);
    toast('Excelを出力しました', `${groups.length} 項目を出力しました。`);
  }
  if (e.target.id === 'btnHitCsv') {
    const TH = {}; DATA.DR_THEMES.forEach(t => TH[t.key] = t);
    downloadXlsx(`DR指摘_${today()}.xlsx`, [
      ['重み', '区分', 'チェック項目', '帳票', '該当欄', '帳票の記載', '足りない理由', 'DRで求めること'],
      ...DATA.DR_INTAKE_HITS.map(h => [
        h.sev === 'high' ? '重点確認候補' : h.sev === 'mid' ? '確認' : '確認できず',
        TH[h.theme].cat, TH[h.theme].item, h.doc, h.where, h.found, h.ng, h.ask])
    ]);
    toast('Excelを出力しました', `${DATA.DR_INTAKE_HITS.length} 件を出力しました。`);
  }
});
