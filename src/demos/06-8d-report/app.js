/* デモ6：品質報告書（8D）作成支援
   不具合記録に書かれている内容だけを各項目へ割り当てる。
   記録から書けない項目は埋めず、何を追記すべきかを示す。
   顧客提出物なので、推測で埋めることが最も危険という前提で設計する。 */

const TR_BY_ID = {};
DATA.TROUBLES.forEach(t => TR_BY_ID[t.id] = t);
const PROC_BY_NO = {};
DATA.PROCESSES.forEach(p => PROC_BY_NO[p.no] = p);
const procLabel = no => PROC_BY_NO[no] ? `工程${no} ${PROC_BY_NO[no].name}` : `工程${no}`;

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

/* 苦情報告書の実物スクショを持っている不具合 */
const COMPLAINT_SHOT = {"QT-2023-0187": "complaint", "QT-2025-0344": "complaint_QT-2025-0344", "QT-2025-0378": "complaint_QT-2025-0378", "QT-2026-0012": "complaint_QT-2026-0012", "QT-2026-0038": "complaint_QT-2026-0038", "QT-2026-0061": "complaint_QT-2026-0061", "QT-2026-0084": "complaint_QT-2026-0084", "QT-2026-0103": "complaint_QT-2026-0103", "QT-2026-0121": "complaint_QT-2026-0121", "QT-2024-0209": "complaint_QT-2024-0209", "QT-2024-0312": "complaint_QT-2024-0312", "QT-2023-0142": "complaint_QT-2023-0142", "QT-2025-0077": "complaint_QT-2025-0077", "QT-2023-0301": "complaint_QT-2023-0301"};

let curTr = null, curDoc = [], history = [];

/* ---- 8Dの各項目を組み立てる ---- */
function buildDoc(t) {
  const useFmea = $('#rfFmea').checked, useSim = $('#rfSim').checked;
  const fmeaRows = useFmea ? DATA.PFMEA.filter(r => r.src === t.id) : [];
  const g = grams(t.sym + ' ' + t.cause);
  const similar = useSim ? DATA.TROUBLES
    .filter(o => o.id !== t.id)
    .map(o => ({ o, s: dice(g, grams(o.sym + ' ' + o.cause)) }))
    .filter(x => x.s >= 0.30).sort((a, b) => b.s - a.s).slice(0, 3) : [];
  const sameProcOther = DATA.TROUBLES.filter(o => o.proc !== t.proc &&
    dice(grams(t.cause), grams(o.cause)) >= 0.30);

  const doc = [];
  // 状態は「本文が書けたか」と「追記が要るか」から決める。
  // filled を別に持つと、本文に「調査中」と書いてあるのに記入済みと数える、といったずれが出る。

  doc.push({ id: 'D1', name: 'チーム編成', text: '',
    missing: '対応チームの構成員が不具合記録に含まれていません。担当部門と責任者を記入してください。',
    ref: '' });

  doc.push({ id: 'D2', name: '問題の記述',
    text: `${t.date}、${t.prod}の${procLabel(t.proc)}で、${t.part}に「${t.sym}」が発生しました。`
      + `当該不具合の評価は、重大度S${t.s}、発生度O${t.o}、検出度D${t.d}です。`
      + (t.leak ? '本件は顧客流出が確認されています。' : '社内で検出されており、顧客流出は確認されていません。'),
    ref: `不具合記録 ${t.id}` });

  doc.push({ id: 'D3', name: '暫定処置',
    text: t.tmp ? `${t.tmp}を実施しました。` : '',
    missing: t.tmp ? '' : '暫定処置の記載が不具合記録にありません。実施した内容と実施日を記入してください。',
    ref: `不具合記録 ${t.id} 暫定対策欄` });

  // 原因は「発生原因」と「流出原因」に分ける。記録が1つしかない場合は流出原因を空欄にする。
  const detHint = fmeaRows.length ? fmeaRows[0].det : '';
  doc.push({ id: 'D4', name: '根本原因の特定',
    text: `【発生原因】${t.cause}\n【流出原因】`
      + (detHint ? `（確認材料）現行の検出手段として「${detHint}」が登録されていますが、本件では検出できませんでした。未検出となった条件は調査中です。` : ''),
    missing: detHint
      ? '流出原因（なぜ検出できなかったか）は特定できていません。上の検出手段は確認材料であり、流出原因そのものではありません。検査記録を確認して記入してください。'
      : '流出原因（なぜ検出できなかったか）が不具合記録から特定できません。検査記録を確認して記入してください。',
    ref: `不具合記録 ${t.id} 原因欄` + (fmeaRows.length ? ` ／ 工程FMEA ${procLabel(t.proc)}` : '') });

  doc.push({ id: 'D5', name: '恒久対策の選定',
    text: t.perm ? `${t.perm}を恒久対策として選定しました。` : '',
    missing: t.perm ? '' : '恒久対策が不具合記録に記載されていません。対策内容を記入してください。',
    ref: `不具合記録 ${t.id} 恒久対策欄` });

  doc.push({ id: 'D6', name: '恒久対策の実施と検証',
    text: t.status === '完了'
      ? `恒久対策は実施済みです。効果検証結果は別途確認が必要です。`
      : '',
    missing: t.status === '完了'
      ? '効果の検証結果（対策後の発生件数・測定値）が記録にありません。検証データを追記してください。'
      : `本件の対応状態は「${t.status}」です。対策の実施が完了していないため、この項目は記入できません。`,
    ref: `不具合記録 ${t.id} 状態` });

  const scope = [];
  if (similar.length) scope.push(`類似する不具合が ${similar.length} 件あります（${similar.map(x => x.o.id).join('、')}）。`);
  if (sameProcOther.length) scope.push(`同じ原因が他工程でも記録されています（${sameProcOther.map(o => procLabel(o.proc)).join('、')}）。同種の確認が必要です。`);
  doc.push({ id: 'D7', name: '再発防止（水平展開の確認候補）',
    text: scope.join('\n'),
    missing: scope.length
      ? '記録から抽出した確認候補です。実際に展開する対象は担当者が確定してください。'
      : '類似する不具合の記録がないため、水平展開の候補を機械的に抽出できません。対象機種・工程を検討して記入してください。',
    ref: similar.length ? `類似記録 ${similar.map(x => x.o.id).join('、')}` : '' });

  doc.push({ id: 'D8', name: '完了確認・承認', text: '',
    missing: '承認者と完了日は記録から特定できません。関係者の確認後に記入してください。',
    ref: '' });

  return doc;
}

/* 記入済み／一部記入（確認が必要）／未記入 の3状態。
   本文が書けていても追記が要るものを、記入済みとして数えない。 */
function stateOf(d) {
  if (!d.text) return 'none';
  return d.missing ? 'partial' : 'done';
}
const STATE_LABEL = {
  done: '<span class="status status--done">記入済み</span>',
  partial: '<span class="status status--warn">一部記入・確認必要</span>',
  none: '<span class="status status--todo">未記入</span>'
};

/* ---- 描画 ---- */
function renderDoc() {
  const nDone = curDoc.filter(d => stateOf(d) === 'done').length;
  const nPart = curDoc.filter(d => stateOf(d) === 'partial').length;
  const nNone = curDoc.filter(d => stateOf(d) === 'none').length;
  const t = curTr;
  const dest = $('#dest').value;

  $('#genResult').innerHTML = `
    <div class="card" style="border-left:4px solid var(--color-primary)">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
        <span class="status status--ai">AIによる初稿</span>
        <span class="cell-sub">対象 ${esc(t.id)}　／　提出先 ${esc(dest)}　／　作成 ${today()}</span>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--space-4);margin-bottom:var(--space-4)">
        <div><p class="kpi__label">記入済み</p><p class="kpi__value" style="font-size:var(--font-section-title)">${nDone}<span class="kpi__unit"> / 8</span></p></div>
        <div><p class="kpi__label"><span class="kpi__dot"></span>一部記入・確認必要</p><p class="kpi__value" style="font-size:var(--font-section-title)">${nPart}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label"><span class="kpi__dot"></span>未記入</p><p class="kpi__value" style="font-size:var(--font-section-title)">${nNone}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">状態</p><p class="kpi__value" style="font-size:var(--font-section-title)">未確定</p><p class="kpi__note">担当者の確認が必要</p></div>
      </div>
      <p style="line-height:var(--line-height-body)">
        不具合記録 <span class="mono">${esc(t.id)}</span> の内容を8Dの各項目へ割り当てました。
        記録から書ける ${nDone} 項目を記入しました。${nPart} 項目は本文を書けたものの<strong>確認が済んでいません</strong>。
        残り ${nNone} 項目は<strong>推測で埋めず空欄にしています</strong>。
        記入済み以外の項目には、何を確認・追記すべきかを表示しています。
      </p>
    </div>

    <div class="section">
      <h2 class="section__title">8D報告書 初稿</h2>
      <p class="section__lead">本文は画面上で直接編集できます。編集した項目は担当者修正済みとして記録されます。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">8D報告書の初稿</caption>
          <thead><tr>
            <th scope="col">項目</th><th scope="col">内容</th><th scope="col">出典</th><th scope="col">状態</th>
          </tr></thead>
          <tbody>${curDoc.map((d, i) => `
            <tr data-i="${i}">
              <td class="nowrap"><strong>${esc(d.id)}</strong><div class="cell-sub">${esc(d.name)}</div></td>
              <td class="col-text">
                <span class="editcell" contenteditable="true" role="textbox"
                      aria-label="${esc(d.id)}の内容を編集"
                      style="white-space:pre-wrap${d.text ? '' : ';min-height:2.4em'}">${esc(d.text || '')}</span>
                ${d.missing ? `
                     <div class="callout callout--warn" style="margin-top:var(--space-2);padding:var(--space-2) var(--space-3);font-size:var(--font-caption)">
                       <div><strong>${d.text ? '確認が必要です' : '追記が必要です'}</strong>　${esc(d.missing)}</div>
                     </div>` : ''}
              </td>
              <td class="col-text cell-sub">${d.ref ? esc(d.ref) : '<span class="cell-empty">—</span>'}</td>
              <td class="nowrap">${STATE_LABEL[stateOf(d)]}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);flex-wrap:wrap">
        <button class="btn btn--primary" id="btnCsv">報告書をExcelで出力する</button>
        <button class="btn btn--secondary" id="btnSave">この内容で保存する</button>
      </div>
      <p style="margin-top:var(--space-3);font-size:var(--font-caption)" id="editNote">
        編集した項目は緑色で表示されます。
      </p>
    </div>

    <div class="section">
      <h2 class="section__title">この初稿の出典</h2>
      <p class="section__lead">各項目の内容は、次の帳票の該当欄から取得しています。画像をクリックすると拡大して確認できます。</p>
      <div class="card">${sheetShot(COMPLAINT_SHOT[curTr.id] || 'complaint',
        '苦情報告書 ' + curTr.id + '（品質苦情処理規定 QR-2201）',
        'D2〜D5はこの帳票の記載をそのまま使い、記載がない項目は空欄にしています。')}</div>
    </div>

    <div class="callout callout--warn">
      <div>
        <p class="callout__title">顧客提出前の確認</p>
        <p>この報告書はAIによる初稿です。未記入項目を確認・補完したうえで提出してください。D4の流出原因、D6の効果検証、D7の水平展開の確認候補は、記録だけでは確定できないため担当者の判断が必要です。提出前に品質保証部の承認を受けてください。</p>
      </div>
    </div>`;

  wireEditable('#genResult', () => {
    const n = $$('#genResult tr[data-edited="true"]').length;
    $('#editNote').textContent = `編集した項目は緑色で表示されます。この初稿で ${n} 項目を担当者が修正しました。`;
  });
  $('#btnCsv').addEventListener('click', exportDoc);
  $('#btnSave').addEventListener('click', () => {
    const texts = $$('#genResult .editcell').map(e => e.textContent.trim());
    const done = texts.filter(Boolean).length;
    history.unshift({ tr: curTr.id, dest, date: today(), filled: done });
    renderList();
    toast('報告書を保存しました', `記入済み ${done}/8 項目。作成済み報告書の画面から確認できます。`);
  });
}

function exportDoc() {
  const cells = $$('#genResult .editcell');
  downloadXlsx(`8D報告書_${curTr.id}_${today()}.xlsx`, [
    ['項目', '名称', '内容', '出典', '状態'],
    ...curDoc.map((d, i) => {
      const txt = cells[i] ? cells[i].textContent.trim() : d.text;
      return [d.id, d.name, txt, d.ref, txt ? (stateOf(d) === 'done' ? '記入済み' : '一部記入・確認必要') : '未記入'];
    }),
    [],
    ['対象不具合', curTr.id, curTr.sym, '', ''],
    ['提出先', $('#dest').value, '', '', ''],
    ['作成日', today(), '', '', '']
  ]);
  const empty = cells.filter(e => !e.textContent.trim()).length;
  if (empty) {
    toast('報告書を出力しました', `未記入項目が ${empty} 件あります。提出前に内容を確認し、必要な情報を補完してください。`, 'warn');
  } else {
    toast('報告書を出力しました', '全項目が記入されています。提出前に品質保証部の承認を受けてください。');
  }
}

/* ---- 作成済み報告書 ---- */
function renderList() {
  $('#listMeta').textContent = history.length
    ? `${history.length} 件つくりました。ブラウザを閉じると消えます。` : '';
  $('#listWrap').hidden = history.length === 0;
  $('#listEmpty').hidden = history.length > 0;
  $('#listBody').innerHTML = history.map(h => {
    const t = TR_BY_ID[h.tr];
    return `<tr>
      <td class="nowrap mono">${esc(h.tr)}<div class="cell-sub">${esc(t ? t.prod : '')}</div></td>
      <td class="col-text">${esc(h.dest)}</td>
      <td class="nowrap mono">${esc(h.date)}</td>
      <td class="nowrap mono">${h.filled} / 8</td>
      <td class="nowrap">${h.filled === 8
        ? '<span class="status status--done">記入済み</span>'
        : '<span class="status status--warn">未記入あり</span>'}</td>
      <td class="nowrap"><button class="btn btn--quiet btn--small" data-reopen="${esc(h.tr)}">この不具合から再作成</button></td>
    </tr>`;
  }).join('');
}

/* ---- 8D様式 ---- */
function renderForm() {
  const refs = {
    D1: '（AIは記入しません）',
    D2: '不具合記録の発生日・製品・工程・現象・S/O/D評価',
    D3: '不具合記録の暫定対策欄',
    D4: '不具合記録の原因欄／工程FMEAの検出手段',
    D5: '不具合記録の恒久対策欄',
    D6: '不具合記録の対応状態（実績値は記録になければ空欄）',
    D7: '類似する不具合記録／同一原因の他工程記録',
    D8: '（AIは記入しません）'
  };
  $('#formBody').innerHTML = DATA.D8_STEPS.map(s => `
    <tr>
      <td class="nowrap"><strong>${esc(s.id)}</strong></td>
      <td class="nowrap">${esc(s.name)}</td>
      <td class="col-text">${esc(s.hint)}</td>
      <td class="col-text cell-sub">${esc(refs[s.id])}</td>
    </tr>`).join('');
}

/* ---- 初期化 ---- */
wireShell();
renderList();
renderForm();

// 顧客流出のあった記録を先頭に
const ordered = DATA.TROUBLES.slice().sort((a, b) => (b.leak ? 1 : 0) - (a.leak ? 1 : 0));
ordered.forEach(t => {
  const o = document.createElement('option');
  o.value = t.id;
  o.textContent = `${t.id}　${t.prod}　${t.sym.slice(0, 22)}${t.leak ? '（流出あり）' : ''}`;
  $('#trSelect').appendChild(o);
});

wireDrop({
  file: '#clFile', sample: '#btnClSample', readout: '#clReadout',
  sampleName: '苦情報告書_QT-2023-0187_ACT-220.xlsx',
  rows: [
    { k: '読み取った品番', v: '<span class="mono">ACT-220</span>' },
    { k: '読み取った現象', v: '車両組付時にコネクタが半嵌合のまま組み付けられた' },
    { k: '読み取った発生日', v: '<span class="mono">2023-07-02</span>' },
    { k: '突き合わせた社内記録', v: '<span class="mono">QT-2023-0187</span>（顧客流出あり）' }
  ],
  toast: 'クレーム票の内容を社内の不具合記録に突き合わせました。報告書を作成できます。',
  onRead: () => { $('#trSelect').value = 'QT-2023-0187'; }
});

$('#genForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('#trSelect').value;
  if (!id) {
    $('#trError').hidden = false;
    $('#trSelect').setAttribute('aria-invalid', 'true');
    toast('対象の不具合を選択してください', '不具合を選ぶと、8D報告書の初稿を作成できます。', 'error');
    return;
  }
  $('#trError').hidden = true;
  $('#trSelect').removeAttribute('aria-invalid');
  curTr = TR_BY_ID[id];
  $('#genIdle').hidden = true;
  $('#genResult').hidden = true;
  $('#genLoading').hidden = false;
  $('#genLoadMeta').textContent =
    `対象：${id}　${curTr.prod}　${procLabel(curTr.proc)}　／　参照：不具合記録・工程FMEA ${DATA.PFMEA.length}行・類似記録`;
  runSteps('#genStepper', () => {
    curDoc = buildDoc(curTr);
    $('#genLoading').hidden = true;
    renderDoc();
    $('#genResult').hidden = false;
  }, 300);
});

document.addEventListener('click', e => {
  const r = e.target.closest('[data-reopen]');
  if (r) {
    $('#trSelect').value = r.dataset.reopen;
    showView('gen');
    $('#genForm').dispatchEvent(new Event('submit'));
  }
});
