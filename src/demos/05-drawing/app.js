/* デモ5：図面検索・検図支援
   検図は「社内の検図ルール」を起点にする。ルールにない観点は指摘しない。
   指摘には必ず、どのルールに対する不足かと、根拠となる過去記録を付ける。 */

const TR_BY_ID = {};
DATA.TROUBLES.forEach(t => TR_BY_ID[t.id] = t);
const DWG_BY_NO = {};
DATA.DRAWINGS.forEach(d => DWG_BY_NO[d.no] = d);
const RULE_BY_ID = {};
DATA.DWG_RULES.forEach(r => RULE_BY_ID[r.id] = r);

/* ---- 類似度 ---- */
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

const SEV_LABEL = {
  '重': '<span class="status status--risk">重要</span>',
  '中': '<span class="status status--warn">中</span>',
  '軽': '<span class="status status--todo">軽微</span>'
};

/* 前機種の対応図面（末尾の3桁が同じもの） */
function prevDrawing(no) {
  const tail = no.slice(-3);
  return DATA.DRAWINGS.find(d => d.no !== no && d.no.endsWith(tail) && d.prod === 'ACT-220');
}

/* ---- 簡易図面（SVG）。指摘箇所を強調表示する ---- */
function drawSvg(no, hits) {
  const marked = hits.length > 0;
  return `
    <svg class="dwg" viewBox="0 0 640 260" role="img"
         aria-label="${esc(no)} の外形と、指摘箇所の位置を示した簡易図です">
      <rect x="70" y="50" width="330" height="150" rx="6" class="part"/>
      <circle cx="235" cy="125" r="42" class="part"/>
      <circle cx="235" cy="125" r="6" class="part"/>
      <line x1="70" y1="225" x2="400" y2="225" class="dim"/>
      <line x1="70" y1="215" x2="70" y2="235" class="dim"/>
      <line x1="400" y1="215" x2="400" y2="235" class="dim"/>
      <text x="215" y="248">外形</text>
      <line x1="440" y1="50" x2="440" y2="200" class="dim"/>
      <line x1="430" y1="50" x2="450" y2="50" class="dim"/>
      <line x1="430" y1="200" x2="450" y2="200" class="dim"/>
      <text x="455" y="130">高さ</text>
      ${[[100, 80], [370, 80], [100, 170], [370, 170]].map(([x, y], i) =>
        `<circle cx="${x}" cy="${y}" r="9" class="${marked && i < hits.length ? 'hit' : 'part'}"/>`).join('')}
      ${marked ? `<circle cx="235" cy="125" r="52" class="hit" fill="none"/>` : ''}
      <text x="70" y="35">${esc(no)}</text>
      <text x="470" y="35">${marked ? '赤い箇所に確認候補' : '確認候補なし'}</text>
    </svg>`;
}

/* ---- 検図 ---- */
let curNo = '', curHits = [];

function buildHits(no) {
  const useRule = $('#ckRule').checked, usePast = $('#ckPast').checked, usePrev = $('#ckPrev').checked;
  return (DATA.DWG_FINDINGS[no] || []).filter(f => {
    const rule = RULE_BY_ID[f.rule];
    const isPast = !!f.src;
    const isPrev = rule && rule.cat === '整合';
    if (isPast && usePast) return true;
    if (isPrev && usePrev) return true;
    return useRule;
  });
}

function renderCheck() {
  const d = DWG_BY_NO[curNo];
  const prev = prevDrawing(curNo);
  const heavy = curHits.filter(h => h.sev === '重');

  if (!curHits.length) {
    $('#ckResult').innerHTML = `
      <div class="card" style="border-left:4px solid var(--color-success)">
        <span class="status status--done">確認完了</span>
        <h2 style="font-size:var(--font-subsection-title);margin:var(--space-3) 0 var(--space-2)">検図ルールに対する不足は見つかりませんでした</h2>
        <p>${esc(curNo)}（${esc(d.name)}）について、${DATA.DWG_RULES.length} 件の検図ルールと過去不具合の対策内容を確認しましたが、確認候補はありませんでした。</p>
        <p style="margin-top:var(--space-3);font-size:var(--font-caption);color:var(--color-text-secondary)">
          ルールにない観点は確認していません。設計意図の妥当性は、この確認の対象外です。
        </p>
      </div>`;
    return;
  }

  $('#ckResult').innerHTML = `
    <div class="card" style="border-left:4px solid var(--color-primary)">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
        <span class="status status--done">確認完了</span>
        <span class="cell-sub">${esc(curNo)}　${esc(d.name)}（${esc(d.rev)}版）　／　${today()}</span>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--space-4);margin-bottom:var(--space-4)">
        <div><p class="kpi__label">確認候補</p><p class="kpi__value" style="font-size:var(--font-section-title)">${curHits.length}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">重要度「重要」</p><p class="kpi__value" style="font-size:var(--font-section-title);color:var(--color-error)">${heavy.length}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">照合したルール</p><p class="kpi__value" style="font-size:var(--font-section-title)">${DATA.DWG_RULES.length}<span class="kpi__unit"> 件</span></p></div>
      </div>
      <p style="line-height:var(--line-height-body)">
        ${esc(curNo)}について、社内の検図ルール ${DATA.DWG_RULES.length} 件と過去不具合の対策内容を照合しました。
        ${prev ? `前機種の対応図面は ${esc(prev.no)}（${esc(prev.rev)}版）です。` : ''}
        ${heavy.length ? `重要度が「重要」の候補が ${heavy.length} 件あります。出図前に確認してください。` : ''}
      </p>
      <div style="margin-top:var(--space-4)">${drawSvg(curNo, curHits)}</div>
      <p style="margin-top:var(--space-2);font-size:var(--font-caption);color:var(--color-text-secondary)">
        図は部位の位置関係を示す簡易表示で、実際の図面ではありません。AIが照合しているのは図面から読み取った寸法・公差・注記です（根拠パネルで実物を確認できます）。
      </p>
    </div>

    <div class="section">
      <h2 class="section__title">確認候補</h2>
      <p class="section__lead">どの検図ルールに対する不足かを明示しています。修正するかどうかは設計担当者が判断してください。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">検図の確認候補</caption>
          <thead><tr>
            <th scope="col">重要度</th><th scope="col">該当箇所</th><th scope="col">確認候補</th>
            <th scope="col">検図ルール</th><th scope="col">根拠</th>
          </tr></thead>
          <tbody>${curHits.map((h, i) => `
            <tr>
              <td class="nowrap">${SEV_LABEL[h.sev]}</td>
              <td class="nowrap">${esc(h.where)}</td>
              <td class="col-text"><strong>${esc(h.found)}</strong><div class="cell-sub">${esc(h.why)}</div></td>
              <td class="nowrap mono">${esc(h.rule)}<div class="cell-sub">${esc(RULE_BY_ID[h.rule] ? RULE_BY_ID[h.rule].cat : '')}</div></td>
              <td class="nowrap"><button class="btn btn--quiet btn--small" data-ev="${i}">根拠を確認する</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);flex-wrap:wrap">
        <button class="btn btn--primary" id="btnCkCsv">確認候補をExcelで出力する</button>
        <button class="btn btn--secondary" id="btnCkReview">設計担当者へ確認を依頼する</button>
      </div>
    </div>

    <div class="callout callout--warn">
      <div>
        <p class="callout__title">この結果を使うときの注意</p>
        <p>確認しているのは社内の検図ルールに対する不足と、過去不具合の対策の反映状況だけです。設計意図そのものの妥当性や、強度・性能の成立性は確認していません。ルールに書かれていない観点は指摘されないため、従来の検図を置き換えるものではありません。</p>
      </div>
    </div>`;

  $('#btnCkCsv').addEventListener('click', () => {
    downloadCsv(`検図結果_${curNo}_${today()}.csv`, [
      ['図面番号', '版', '重要度', '該当箇所', '確認候補', '理由', '検図ルール番号', 'ルール内容', '根拠となる過去記録'],
      ...curHits.map(h => [curNo, d.rev, h.sev, h.where, h.found, h.why, h.rule,
        RULE_BY_ID[h.rule] ? RULE_BY_ID[h.rule].rule : '', h.src || ''])
    ]);
    toast('確認候補を出力しました', `${curHits.length} 件を出力しました。`);
  });
  $('#btnCkReview').addEventListener('click', () => {
    toast('確認を依頼しました', `${curNo} の確認候補 ${curHits.length} 件について、設計担当者へ確認依頼を作成しました。`);
  });
}

function openEv(i) {
  const h = curHits[i];
  if (!h) return;
  const rule = RULE_BY_ID[h.rule];
  const src = h.src ? TR_BY_ID[h.src] : null;
  const prev = prevDrawing(curNo);
  openPanel('根拠：' + h.where, `
    <dl class="meta-list">
      <dt>対象図面</dt><dd class="mono">${esc(curNo)}　${esc(DWG_BY_NO[curNo].name)}</dd>
      <dt>該当箇所</dt><dd>${esc(h.where)}</dd>
      <dt>重要度</dt><dd>${esc(h.sev)}</dd>
    </dl>
    <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">照合した検図ルール</h3>
    <div class="quote">
      <p><span class="mono">${esc(h.rule)}</span>（${esc(rule.cat)}・重要度${esc(rule.sev)}）</p>
      <p style="margin-top:var(--space-2)"><mark>${esc(rule.rule)}</mark></p>
    </div>
    <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">図面の記載と、確認が必要な理由</h3>
    <div class="quote">
      <p><strong>図面の記載</strong><br>${esc(h.found)}</p>
      <p style="margin-top:var(--space-3)"><strong>理由</strong><br>${esc(h.why)}</p>
    </div>
    ${src ? `
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">根拠となる過去の不具合</h3>
      <div class="quote">
        <p><strong><span class="mono">${esc(src.id)}</span>（${esc(src.date)}・${esc(src.prod)}）</strong></p>
        <p style="margin-top:var(--space-2)">${esc(src.sym)}</p>
        <p style="margin-top:var(--space-3)"><strong>恒久対策</strong><br>${esc(src.perm)}</p>
      </div>
      <p style="margin-top:var(--space-3);font-size:var(--font-caption);color:var(--color-text-secondary)">
        この対策が今回の図面に反映されているかを確認しています。
      </p>` : `
      <p style="margin-top:var(--space-4);font-size:var(--font-caption);color:var(--color-text-secondary)">
        この確認候補に対応する過去不具合はありません。検図ルールに対する不足としてのみ検出しています。
      </p>`}
    ${curNo === 'ACT-230-300' ? sheetShot('drawing',
       '図面属性表 ACT-230-300（図面から読み取った寸法・公差・注記・部品表）',
       'AIが照合しているのは、図面から読み取ったこの内容です。本実装ではCADデータまたはPDF図面から同じ項目を抽出し、該当箇所を強調します。') : ''}
    ${prev ? `
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">前機種の対応図面</h3>
      <p><span class="mono">${esc(prev.no)}</span>　${esc(prev.name)}（${esc(prev.rev)}版・${esc(prev.date)}）</p>
      <p class="cell-sub">主要寸法：${esc(prev.key)}${prev.ecn ? `　／　適用済みの設計変更：${esc(prev.ecn)}` : ''}</p>` : ''}`);
}

/* ---- 類似図面検索 ---- */
function renderSearch(q) {
  const g = grams(q);
  const hits = DATA.DRAWINGS.map(d => ({
    d, score: dice(g, grams(d.name + ' ' + d.key + ' ' + d.no + ' ' + d.prod))
  })).filter(x => x.score >= 0.08).sort((a, b) => b.score - a.score).slice(0, 5);

  if (!hits.length) {
    $('#sResult').innerHTML = `
      <div class="empty">
        <h2 class="empty__title">該当する図面が見つかりませんでした</h2>
        <div class="empty__body">
          <p>追加で試せること:</p>
          <ul>
            <li>部位名だけで検索する（ハウジング、ギヤ、ケースなど）</li>
            <li>寸法の表記（φ、公差など）で検索する</li>
            <li>製品コード（ACT-220 など）で検索する</li>
          </ul>
        </div>
      </div>`;
    return;
  }

  $('#sResult').innerHTML = `
    <div class="table-meta">${hits.length} 件を関連度の高い順に表示しています</div>
    <div class="table-wrap">
      <table>
        <caption class="visually-hidden">類似図面の検索結果</caption>
        <thead><tr>
          <th scope="col">関連度</th><th scope="col">図面番号</th><th scope="col">名称</th>
          <th scope="col">製品・版</th><th scope="col">主要寸法</th><th scope="col">設計変更</th><th scope="col">操作</th>
        </tr></thead>
        <tbody>${hits.map(x => `
          <tr>
            <td class="mono nowrap">${Math.round(x.score * 100)}%</td>
            <td class="mono nowrap">${esc(x.d.no)}</td>
            <td class="col-text">${esc(x.d.name)}</td>
            <td class="nowrap">${esc(x.d.prod)}<div class="cell-sub">${esc(x.d.rev)}版・${esc(x.d.date)}</div></td>
            <td class="col-text mono">${esc(x.d.key)}</td>
            <td class="nowrap">${x.d.ecn ? `<span class="mono cell-sub">${esc(x.d.ecn)}</span>` : '<span class="cell-empty">—</span>'}</td>
            <td class="nowrap">${DATA.DWG_FINDINGS[x.d.no]
              ? `<button class="btn btn--quiet btn--small" data-check="${esc(x.d.no)}">この図面を検図する</button>`
              : '<span class="cell-sub">出図済み</span>'}</td>
          </tr>`).join('')}
      </tbody>
      </table>
    </div>`;
}

/* ---- 図面一覧 ---- */
function renderList() {
  $('#listMeta').textContent =
    `全 ${DATA.DRAWINGS.length} 件　／　うち検図対象（出図前）${Object.keys(DATA.DWG_FINDINGS).length} 件`;
  $('#listBody').innerHTML = DATA.DRAWINGS.map(d => {
    const f = DATA.DWG_FINDINGS[d.no];
    return `<tr>
      <td class="mono nowrap">${esc(d.no)}</td>
      <td class="col-text">${esc(d.name)}</td>
      <td class="nowrap">${esc(d.prod)}</td>
      <td class="nowrap mono">${esc(d.rev)}</td>
      <td class="nowrap mono">${esc(d.date)}</td>
      <td class="col-text mono cell-sub">${esc(d.key)}</td>
      <td class="nowrap">${f
        ? `<span class="status status--warn">確認候補 ${f.length} 件</span>`
        : '<span class="status status--done">出図済み</span>'}</td>
      <td class="nowrap">${f
        ? `<button class="btn btn--quiet btn--small" data-check="${esc(d.no)}">検図する</button>`
        : '<span class="cell-empty">—</span>'}</td>
    </tr>`;
  }).join('');
}

/* ---- 検図ルール ---- */
function renderRules() {
  const counts = {};
  Object.values(DATA.DWG_FINDINGS).flat().forEach(f => counts[f.rule] = (counts[f.rule] || 0) + 1);
  $('#rulesBody').innerHTML = DATA.DWG_RULES.map(r => `
    <tr>
      <td class="mono nowrap">${esc(r.id)}</td>
      <td class="nowrap">${esc(r.cat)}</td>
      <td class="col-text">${esc(r.rule)}</td>
      <td class="nowrap">${SEV_LABEL[r.sev]}</td>
      <td class="nowrap">${counts[r.id]
        ? `<span class="mono">${counts[r.id]} 件</span>`
        : '<span class="cell-empty">—</span>'}</td>
    </tr>`).join('');
}

/* ---- 初期化 ---- */
wireShell();
renderList();
renderRules();

Object.keys(DATA.DWG_FINDINGS).forEach(no => {
  const o = document.createElement('option');
  o.value = no;
  o.textContent = `${no}　${DWG_BY_NO[no] ? DWG_BY_NO[no].name : ''}`;
  $('#dwgSelect').appendChild(o);
});

const SAMPLES = ['ケースの締結', 'ガスケット溝の深さ', '軸受穴の公差', '減速ギヤの歯面'];
$('#sChips').innerHTML = SAMPLES.map(s =>
  `<button class="chip" type="button" data-q="${esc(s)}">${esc(s)}</button>`).join('');
$('#sChips').addEventListener('click', e => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  $('#sq').value = b.dataset.q;
  renderSearch(b.dataset.q);
});

$('#sForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#sq').value.trim();
  if (!q) {
    toast('探している内容を入力してください', '部位名や寸法の言葉で検索できます。', 'error');
    return;
  }
  renderSearch(q);
});

$('#ckForm').addEventListener('submit', e => {
  e.preventDefault();
  const no = $('#dwgSelect').value;
  if (!no) {
    $('#dwgError').hidden = false;
    $('#dwgSelect').setAttribute('aria-invalid', 'true');
    toast('対象図面を選択してください', '図面を選ぶと検図を開始できます。', 'error');
    return;
  }
  $('#dwgError').hidden = true;
  $('#dwgSelect').removeAttribute('aria-invalid');
  curNo = no;
  $('#ckIdle').hidden = true;
  $('#ckResult').hidden = true;
  $('#ckLoading').hidden = false;
  $('#ckLoadMeta').textContent =
    `対象：${no}　／　検図ルール ${DATA.DWG_RULES.length} 件・不具合記録 ${DATA.TROUBLE_TOTAL.toLocaleString()} 件と照合します`;
  runSteps('#ckStepper', () => {
    curHits = buildHits(no);
    $('#ckLoading').hidden = true;
    renderCheck();
    $('#ckResult').hidden = false;
  }, 300);
});

document.addEventListener('click', e => {
  const ev = e.target.closest('[data-ev]');
  if (ev) { openEv(Number(ev.dataset.ev)); return; }
  const ck = e.target.closest('[data-check]');
  if (ck) {
    $('#dwgSelect').value = ck.dataset.check;
    showView('check');
    $('#ckForm').dispatchEvent(new Event('submit'));
  }
});
