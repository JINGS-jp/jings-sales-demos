/* デモ4：設計レビュー支援AI（DR）
   画面は2つ。
   ・レビュー観点の抽出：過去のDR議事録から、繰り返し指摘された観点をチェックリストにする
   ・DRチェック：今回の帳票を取り込み、選んだ情報と突き合わせて指摘をまとめて出す
   旧・設計審査（DR）支援
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


/* ---- 初期化 ---- */
wireShell();
missed = detectMissed();


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

/* ---- レビュー観点の抽出の配線 ---- */
wireDrop({
  file: '#pastFile', sample: '#btnPastSample', readout: '#pastReadout',
  sampleName: '設計審査議事録_2021-2024（12ファイル）', rows: PAST_SAMPLE,
  onRead: () => { $('#btnPastRun').disabled = false; }
});
$('#btnPastRun').addEventListener('click', runPast);

document.addEventListener('click', e => {
  const ad = e.target.closest('#pastResult [data-adopt]');
  if (ad) {
    const g = groupPast().groups[Number(ad.dataset.adopt)];
    ad.closest('.card').style.background = 'var(--color-success-bg)';
    ad.closest('.card').style.borderColor = 'var(--color-success-line)';
    ad.textContent = '採用しました';
    ad.disabled = true;
    toast('項目を採用しました', g.t.item);
    return;
  }
  const dr = e.target.closest('#pastResult [data-drop]');
  if (dr) {
    dr.closest('.card').style.opacity = '.5';
    dr.textContent = '使いません';
    dr.disabled = true;
    return;
  }
  if (e.target.id === 'btnChkCsv') {
    const { groups } = groupPast();
    downloadXlsx(`DRチェックリスト_${today()}.xlsx`, [
      ['区分', 'チェック項目', '過去の指摘回数', '対象機種', '抽出元の記録'],
      ...groups.map(g => [g.t.cat, g.t.item, g.says.length,
        [...new Set(g.says.map(s => s.prod))].join('・'), g.says.map(s => s.id).join(' ')])
    ]);
    toast('Excelを出力しました', `${groups.length} 項目を出力しました。`);
  }
});

/* ===== DRチェック ==========================================
   今回の帳票を取り込み、選んだ情報と突き合わせる。
   出どころの違う指摘を1つの一覧にまとめ、確認区分の重い順に並べる。 */

const CHK_ROWS = [
  { k: '対象機種', v: 'ACT-230（新機種）' },
  { k: '審査ゲート', v: 'DR3 詳細設計審査（2026-08-27）' },
  { k: '読み取った欄', v: '注記・材質・変更内容・評価計画' }
];
let chkRead = false;
let chkOut = [];

const LV = {
  high: '<span class="status status--risk">重点確認</span>',
  mid: '<span class="status status--warn">確認</span>',
  std: '<span class="status status--todo">標準項目</span>',
  open: '<span class="status status--todo">確認できず</span>'
};

/* 出どころの違う指摘を1本にまとめる */
function buildCheck() {
  const useList = $('#mxList').checked, useStd = $('#mxStd').checked;
  const useDone = $('#mxDone').checked, useCarry = $('#mxCarry').checked;
  const usePrev = $('#mxPrev').checked;
  const TH = {}; DATA.DR_THEMES.forEach(t => TH[t.key] = t);
  const out = [];

  // 1. 抽出したレビュー観点と、帳票の記載の突き合わせ
  if (useList) {
    DATA.DR_INTAKE_HITS.forEach((h, i) => {
      const t = TH[h.theme];
      out.push({
        src: 'レビュー観点', lv: h.sev === 'high' ? 'high' : h.sev === 'mid' ? 'mid' : 'open',
        cat: t.cat, title: t.item, doc: h.doc, where: h.where,
        found: h.found, why: h.ng, ask: h.ask,
        says: DATA.DR_PAST.filter(p => p.theme === h.theme), key: 'hit' + i
      });
    });
  }

  // 2. DR3の標準確認項目に、変更点・過去不具合・前回指摘を突き合わせる
  if (useStd) {
    buildPrep('DR3').forEach((p, i) => {
      out.push({
        src: '標準確認項目', lv: p.level, cat: p.item.cat, title: p.item.item,
        doc: 'DR3 設計審査規程', where: p.item.id,
        found: p.hits.length ? p.hits.map(h => h.why).join('／') : '突き合わせの結果は付きませんでした',
        why: p.hits.length ? '' : '関連情報との一致は確認できませんでした。標準項目として確認してください。',
        ask: p.hits.length ? 'DRの場で、上の根拠に沿って確認する' : '標準項目として確認する',
        hits: p.hits, key: 'std' + i
      });
    });
  }

  // 3. 完了扱いだが、完了後に設計変更が入っている指摘
  if (useDone) {
    missed.out.forEach((m, i) => {
      out.push({
        src: '完了扱いの再確認', lv: 'high', cat: m.f.cat,
        title: `${m.f.item}（${m.f.id} は変更前の条件で完了としている）`,
        doc: m.ecn.no, where: '設計変更',
        found: `完了期限 ${m.f.due} ＜ 設計変更の発行日 ${m.ecn.date}`,
        why: '完了と判断した時点では、この設計変更はまだ入っていません。確認した内容は変更前の条件に対するものです。',
        ask: `${m.ecn.no} の変更後の条件で再確認する`,
        miss: i, key: 'miss' + i
      });
    });
  }

  // 4. 前回までのDRで指摘され、まだ完了していないもの
  if (usePrev) {
    findings.filter(f => f.status !== '完了').forEach((f, i) => {
      out.push({
        src: '前回までの指摘', lv: 'mid', cat: f.cat, title: f.item,
        doc: f.gate, where: f.id,
        found: `担当 ${f.by}　期限 ${f.due}　状態 ${f.status}`,
        why: '前回までのDRで指摘され、まだ完了していません。',
        ask: 'DR3を開く前に対応状況を確認する',
        link: f.link, key: 'prev' + i
      });
    });
  }

  // 5. 他機種のDRで出ていて、今回も同じ観点が要りそうなもの
  if (useCarry) {
    const done = findings.filter(f => f.status === '完了');
    const cur = (DATA.DR_CHECKLIST.DR3 || []).map(c => grams(c.item + ' ' + c.cat));
    done.forEach((f, i) => {
      const g = grams(f.item + ' ' + f.cat);
      const covered = cur.some(c => dice(g, c) >= 0.2);
      if (covered) return;
      out.push({
        src: '横展開の候補', lv: 'mid', cat: f.cat, title: f.item,
        doc: f.gate, where: f.id,
        found: `${f.gate}で指摘され、完了しています（担当 ${f.by}）`,
        why: '今回のDR3の確認項目に、同じ観点が見当たりません。',
        ask: '今回も同じ観点が必要かを確認する',
        link: f.link, key: 'carry' + i
      });
    });
  }

  const rank = { high: 0, mid: 1, std: 2, open: 3 };
  return out.sort((a, b) => rank[a.lv] - rank[b.lv]);
}

function runCheck() {
  $('#chkIdle').hidden = true;
  $('#chkResult').hidden = true;
  $('#chkLoading').hidden = false;
  const n = [$('#mxList'), $('#mxStd'), $('#mxChange'), $('#mxTrouble'),
             $('#mxPrev'), $('#mxDone'), $('#mxCarry')].filter(x => x.checked).length;
  $('#chkLoadMeta').textContent =
    `2ファイル／${n} 種類の情報と突き合わせ／標準の確認項目 ${(DATA.DR_CHECKLIST.DR3 || []).length} 件`;
  runSteps('#chkStepper', () => {
    chkOut = buildCheck();
    $('#chkLoading').hidden = true;
    renderCheck();
    $('#chkResult').hidden = false;
    const h = chkOut.filter(x => x.lv === 'high').length;
    toast('指摘を出しました', `${chkOut.length} 件（うち重点確認 ${h} 件）をまとめました。`);
  }, 300);
}

function renderCheck() {
  const c = k => chkOut.filter(x => x.lv === k).length;
  const bySrc = {};
  chkOut.forEach(x => bySrc[x.src] = (bySrc[x.src] || 0) + 1);

  $('#chkResult').innerHTML = `
    <div class="card" style="border-left:4px solid var(--color-primary);margin-bottom:var(--space-5)">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
        <span class="status status--ai">照合結果</span>
        <span class="cell-sub">図面 ACT-230-300 RevA ／ 変更発議書 ACT-230 2026-07-01　／　${today()}</span>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--space-4);margin-bottom:var(--space-4)">
        <div><p class="kpi__label">指摘</p><p class="kpi__value" style="font-size:var(--font-section-title)">${chkOut.length}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label"><span class="kpi__dot kpi__dot--risk"></span>重点確認</p><p class="kpi__value" style="font-size:var(--font-section-title)">${c('high')}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label"><span class="kpi__dot"></span>確認</p><p class="kpi__value" style="font-size:var(--font-section-title)">${c('mid')}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">標準項目</p><p class="kpi__value" style="font-size:var(--font-section-title)">${c('std')}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">確認できず</p><p class="kpi__value" style="font-size:var(--font-section-title)">${c('open')}<span class="kpi__unit"> 件</span></p></div>
      </div>
      <p style="line-height:var(--line-height-body)">
        ${Object.entries(bySrc).map(([k, v]) => `${esc(k)} ${v}件`).join('　／　')} を1つの一覧にまとめました。
        確認区分の重い順に並べています。標準項目も除外していません。除外するかどうかは主査が判断してください。
      </p>
    </div>

    ${chkOut.map((x, i) => `
      <div class="card" style="margin-bottom:var(--space-4);border-left:4px solid var(--color-${
        x.lv === 'high' ? 'error' : x.lv === 'mid' ? 'warning' : 'border'})">
        <div style="display:flex;align-items:flex-start;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
          ${LV[x.lv]}
          <span class="status status--todo">${esc(x.cat)}</span>
          <span class="cell-sub">${esc(x.src)}　／　${esc(x.doc)}${x.where !== '—' ? '　' + esc(x.where) : ''}</span>
        </div>
        <h3 style="font-size:var(--font-subsection-title);margin-bottom:var(--space-3)">${esc(x.title)}</h3>
        <div style="display:grid;gap:var(--space-3)">
          <div>
            <p style="font-size:var(--font-caption);color:var(--color-text-secondary);margin-bottom:var(--space-1)">確認した内容</p>
            <blockquote class="quote"><p>${esc(x.found)}</p></blockquote>
          </div>
          ${x.why ? `<div>
            <p style="font-size:var(--font-caption);color:var(--color-text-secondary);margin-bottom:var(--space-1)">判断の理由</p>
            <p style="line-height:var(--line-height-body)">${esc(x.why)}</p>
          </div>` : ''}
          <div>
            <p style="font-size:var(--font-caption);color:var(--color-text-secondary);margin-bottom:var(--space-1)">DRで確認すること</p>
            <p style="line-height:var(--line-height-body)"><strong>${esc(x.ask)}</strong></p>
          </div>
        </div>
        ${x.says && x.says.length ? `
        <details style="margin-top:var(--space-4)">
          <summary>この観点のもとになった過去の発言 ${x.says.length} 件</summary>
          <div style="margin-top:var(--space-3)">
            ${x.says.map(s => `
              <blockquote class="quote" style="margin-bottom:var(--space-3)">
                <p>${esc(s.say)}</p>
                <footer class="cell-sub" style="margin-top:var(--space-2)">${esc(s.id)}　${esc(s.date)}　${esc(s.prod)}　${esc(s.by)}</footer>
              </blockquote>`).join('')}
          </div>
        </details>` : ''}
        <div style="margin-top:var(--space-4);display:flex;gap:var(--space-3);flex-wrap:wrap">
          ${x.miss != null ? `<button class="btn btn--quiet btn--small" data-missev="${x.miss}">たどった経路を確認する</button>` : ''}
          ${x.link ? `<button class="btn btn--quiet btn--small" data-tr="${esc(x.link)}">根拠の記録を見る</button>` : ''}
          <button class="btn btn--secondary btn--small" data-take="${i}">指摘として起票する</button>
          <button class="btn btn--quiet btn--small" data-drop2="${i}">今回は確認しない</button>
        </div>
      </div>`).join('')}

    <div class="callout callout--warn" style="margin-top:var(--space-5)">
      <div>
        <p class="callout__title">この結果の見方</p>
        <p>確認区分は突き合わせの結果による並び替えであり、確認の要否を決めるものではありません。「確認できず」は記載がないという意味ではなく、取り込んだ帳票の中に見つけられなかっただけです。別の文書に書いてある可能性があります。</p>
      </div>
    </div>

    <div style="margin-top:var(--space-5)">
      <button class="btn btn--primary" id="btnChkOut">指摘をExcelで出力する</button>
    </div>`;
}

/* ---- 配線 ---- */
wireDrop({
  file: '#chkFile', sample: '#btnChkSample', readout: '#chkReadout',
  sampleName: '図面 ACT-230-300 RevA ほか1件', rows: CHK_ROWS,
  toast: '記載内容を読み取りました。突き合わせる情報を選んで実行できます。',
  onRead: () => { chkRead = true; $('#chkError').hidden = true; }
});

$('#chkForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!chkRead) {
    $('#chkError').hidden = false;
    toast('帳票が取り込まれていません', 'ファイルを選ぶか、見本を使ってください。', 'error');
    return;
  }
  runCheck();
});

document.addEventListener('click', e => {
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
          ${m.piggy.length ? `<p style="margin-top:var(--space-2)"><strong>関連変更</strong><br>${m.piggy.map(x => `<span class="mono">${esc(x.no)}</span>　${esc(x.title)}`).join('<br>')}</p>` : ''}
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

  const tk = e.target.closest('[data-take]');
  if (tk) {
    const x = chkOut[Number(tk.dataset.take)];
    const id = `DR3-${String(findings.filter(f => f.gate === 'DR3').length + 20).padStart(2, '0')}`;
    findings.push({ id, gate: 'DR3', cat: x.cat, item: x.title,
      by: '技術部 森', due: '2026-08-25', status: '未着手', link: x.link || '' });
    tk.closest('.card').style.background = 'var(--color-success-bg)';
    tk.textContent = '起票しました';
    tk.disabled = true;
    toast('指摘として起票しました', `${id}　担当と期限は仮置きです。`);
    return;
  }
  const dp = e.target.closest('[data-drop2]');
  if (dp) {
    dp.closest('.card').style.opacity = '.5';
    dp.textContent = '確認しません';
    dp.disabled = true;
    return;
  }
  if (e.target.id === 'btnChkOut') {
    downloadXlsx(`DRチェック結果_${today()}.xlsx`, [
      ['確認区分', '出どころ', '区分', '確認項目', '対象文書', '該当箇所', '確認した内容', '判断の理由', 'DRで確認すること'],
      ...chkOut.map(x => [
        x.lv === 'high' ? '重点確認' : x.lv === 'mid' ? '確認' : x.lv === 'std' ? '標準項目' : '確認できず',
        x.src, x.cat, x.title, x.doc, x.where, x.found, x.why, x.ask])
    ]);
    toast('Excelを出力しました', `${chkOut.length} 件を出力しました。`);
  }
});

