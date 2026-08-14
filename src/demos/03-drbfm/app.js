/* デモ3：変更点起点の設計品質AI（DRBFM）
   起点は帳票のプルダウンではなく「変更発議書の投げ込み」。帳票は生成物であって起点ではない。
   生成行ごとに源泉系統（過去実績・機能演繹・物理推論・環境知見）を表示し、
   「過去データを検索しているだけ」という疑問に先回りする。 */

const TR_BY_ID = {};
DATA.TROUBLES.forEach(t => TR_BY_ID[t.id] = t);

/* 変更点ごとにDRBFM行をまとめる */
const CHANGES = [];
DATA.DRBFM.forEach(r => {
  let c = CHANGES.find(x => x.cp === r.cp);
  if (!c) { c = { cp: r.cp, why: r.why, rows: [] }; CHANGES.push(c); }
  c.rows.push(r);
});

let readOk = false, carryMode = null, curRows = [], edits = 0;

/* ---- 発議書の読み取り（デモではサンプル表示） ---- */
function showReadout(fileName) {
  readOk = true;
  $('#readout').hidden = false;
  $('#readout').innerHTML = `
    <div class="callout callout--info">
      <div>
        <p class="callout__title">発議書を読み取りました</p>
        <dl class="meta-list" style="margin-top:var(--space-2)">
          <dt>ファイル</dt><dd class="mono">${esc(fileName)}</dd>
          <dt>対象品番</dt><dd class="mono">ACT-230（電動アクチュエータ 小型軽量品）</dd>
          <dt>読み取った変更点</dt><dd>${CHANGES.length} 件</dd>
          <dt>変更理由</dt><dd>小型軽量化と応答速度の向上、および耐熱性の確保</dd>
        </dl>
        <p style="margin-top:var(--space-3);font-size:var(--font-caption);color:var(--color-text-secondary)">
          デモ環境のため、読み取り結果はサンプルを表示しています。本実装では投げ込んだファイルの記載内容を解析します。
        </p>
      </div>
    </div>`;
  $('#btnGen').disabled = false;
  $('#genHint').textContent = '読み取り結果をもとにDRBFMの初版を生成します。';
  toast('発議書を読み取りました', `変更点 ${CHANGES.length} 件を検出しました。生成ボタンが押せます。`);
}

/* ---- 生成 ---- */
function selectedKinds() {
  return {
    past: $('#scPast').checked, func: $('#scFunc').checked,
    phys: $('#scPhys').checked, env: $('#scEnv').checked
  };
}

function buildRows() {
  const k = selectedKinds();
  return DATA.DRBFM.filter(r => k[r.srcKind]).map((r, i) => {
    // 「条件付きで引き継ぐ」を選んだ場合、過去実績由来の行に再評価の注記を付ける
    const recheck = carryMode === 'cond' && r.srcKind === 'past';
    const drop = carryMode === 'sep' && r.srcKind === 'past';
    return { ...r, key: 'r' + i, recheck, drop };
  }).filter(r => !r.drop);
}

function srcBadge(kind) {
  const k = DATA.SRC_KINDS[kind];
  return `<span class="src src--${esc(kind)}">${esc(k ? k.label : kind)}</span>`;
}

function renderResult() {
  const byCp = [];
  curRows.forEach(r => {
    let c = byCp.find(x => x.cp === r.cp);
    if (!c) { c = { cp: r.cp, why: r.why, rows: [] }; byCp.push(c); }
    c.rows.push(r);
  });
  const counts = {};
  curRows.forEach(r => counts[r.srcKind] = (counts[r.srcKind] || 0) + 1);
  const newArea = curRows.filter(r => r.srcKind === 'func' || r.srcKind === 'phys').length;

  const carryLabel = { keep: '同一視して実績を引き継ぐ', cond: '条件付きで引き継ぐ', sep: '別部材として扱う' }[carryMode];

  const summary = `
    <div class="card" style="border-left:4px solid var(--color-primary)">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
        <span class="status status--done">生成完了</span>
        <span class="cell-sub">対象 ACT-230　／　生成 ${today()}</span>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:var(--space-4);margin-bottom:var(--space-4)">
        <div><p class="kpi__label">変更点</p><p class="kpi__value" style="font-size:var(--font-section-title)">${byCp.length}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">生成した心配点</p><p class="kpi__value" style="font-size:var(--font-section-title)">${curRows.length}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">過去実績のない領域</p><p class="kpi__value" style="font-size:var(--font-section-title)">${newArea}<span class="kpi__unit"> 件</span></p><p class="kpi__note">機能演繹・物理推論で生成</p></div>
      </div>
      <p style="line-height:var(--line-height-body)">
        変更発議書から ${byCp.length} 件の変更点を整理し、変更点ごとに心配点を生成しました。
        類似部材の判定は「<strong>${esc(carryLabel)}</strong>」として処理しています。
        ${newArea ? `うち ${newArea} 件は過去に同種の実績がなく、機能からの演繹と材料物性からの推論で生成しています。` : ''}
      </p>
      <div class="chip-row" style="margin-top:var(--space-3)">
        ${Object.keys(counts).map(k => `${srcBadge(k)}<span class="cell-sub" style="margin-right:var(--space-3)">&nbsp;${counts[k]}件</span>`).join('')}
      </div>
    </div>`;

  const sections = byCp.map((c, ci) => `
    <div class="section">
      <h2 class="section__title">変更点${ci + 1}：${esc(c.cp)}</h2>
      <p class="section__lead">変更理由：${esc(c.why)}</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">${esc(c.cp)}の心配点</caption>
          <thead><tr>
            <th scope="col">心配点</th><th scope="col">故障モード</th><th scope="col">影響</th>
            <th scope="col">対策候補</th><th scope="col">S・O・D候補</th>
            <th scope="col">系統</th><th scope="col">状態</th><th scope="col">根拠</th>
          </tr></thead>
          <tbody>${c.rows.map(r => `
            <tr data-key="${esc(r.key)}">
              <td class="col-text">${esc(r.worry)}</td>
              <td class="col-text"><strong>${esc(r.mode)}</strong></td>
              <td class="col-text">${esc(r.eff)}</td>
              <td class="col-text"><span class="editcell" contenteditable="true" role="textbox" aria-label="対策候補を編集">${esc(r.act)}</span></td>
              <td class="nowrap">
                <span class="sod-badge${r.s >= 8 ? ' sod-badge--hi' : ''}">S${r.s}</span>
                <span class="sod-badge">O${r.o}</span>
                <span class="sod-badge">D${r.d}</span>
                <div class="cell-sub">AI候補・要確認</div>
              </td>
              <td class="nowrap">${srcBadge(r.srcKind)}</td>
              <td class="nowrap">
                ${r.status === '担当者確認済み'
                  ? '<span class="status status--done">担当者確認済み</span>'
                  : '<span class="status status--ai">AI提案</span>'}
                ${r.recheck ? '<div style="margin-top:var(--space-1)"><span class="status status--warn">要再評価</span></div>' : ''}
              </td>
              <td class="nowrap"><button class="btn btn--quiet btn--small" data-ev="${esc(r.key)}">根拠を確認する</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`).join('');

  $('#genResult').innerHTML = summary + sections + `
    <div class="section">
      <div style="display:flex;gap:var(--space-3);flex-wrap:wrap">
        <button class="btn btn--primary" id="btnCsv">DRBFMをExcelで出力する</button>
        <button class="btn btn--secondary" id="btnReview">設計審査へ提出する</button>
      </div>
      <p style="margin-top:var(--space-3);font-size:var(--font-caption);color:var(--color-text-secondary)" id="editNote">
        対策候補のセルは画面上で直接編集できます。編集した行は「担当者修正済み」として記録されます。
      </p>
    </div>

    <div class="callout callout--warn">
      <div>
        <p class="callout__title">この結果を使うときの注意</p>
        <p>S・O・Dは候補値であり、確定は設計担当者が行います。過去実績のない領域は機能演繹と物理推論による候補のため、成立するかどうかは試験または解析での確認が必要です。類似部材の判定結果は記録され、以後の判定に反映されます。</p>
      </div>
    </div>`;

  wireEditable('#genResult', () => {
    edits++;
    $('#editNote').textContent = `対策候補のセルは画面上で直接編集できます。この生成で ${edits} 箇所を担当者が修正しました（緑色の行）。`;
  });
  $('#btnCsv').addEventListener('click', exportCsv);
  $('#btnReview').addEventListener('click', () => {
    toast('設計審査へ提出しました', `${curRows.length} 行を DR3（詳細設計審査）の審査資料として登録しました。`);
  });
}

function exportCsv() {
  downloadCsv(`DRBFM_ACT-230_${today()}.csv`, [
    ['変更点', '変更理由', '心配点', '故障モード', '影響', '対策候補',
     '重大度S', '発生度O', '検出度D', 'RPN', '生成系統', '生成根拠', '確認状態', '再評価要否'],
    ...curRows.map(r => {
      const k = DATA.SRC_KINDS[r.srcKind];
      return [r.cp, r.why, r.worry, r.mode, r.eff, r.act, r.s, r.o, r.d, r.s * r.o * r.d,
        k ? k.label : r.srcKind, k ? k.desc : '', r.status, r.recheck ? '要再評価' : ''];
    })
  ]);
  toast('DRBFMを出力しました', `${curRows.length} 行を出力しました。生成系統と確認状態を列に含めています。`);
}

/* ---- 根拠パネル ---- */
function openEv(key) {
  const r = curRows.find(x => x.key === key);
  if (!r) return;
  const k = DATA.SRC_KINDS[r.srcKind];
  const src = r.src ? TR_BY_ID[r.src] : null;
  openPanel('根拠：' + r.mode, `
    <dl class="meta-list">
      <dt>変更点</dt><dd>${esc(r.cp)}</dd>
      <dt>変更理由</dt><dd>${esc(r.why)}</dd>
      <dt>生成系統</dt><dd>${srcBadge(r.srcKind)}　${esc(k ? k.desc : '')}</dd>
    </dl>
    <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">この心配点を導いた過程</h3>
    <div class="quote">
      <p><strong>変更点</strong><br>${esc(r.cp)}</p>
      <p style="margin-top:var(--space-3)"><strong>心配点</strong><br><mark>${esc(r.worry)}</mark></p>
      <p style="margin-top:var(--space-3)"><strong>故障モード</strong><br>${esc(r.mode)}</p>
      <p style="margin-top:var(--space-3)"><strong>影響</strong><br>${esc(r.eff)}</p>
      <p style="margin-top:var(--space-3)"><strong>対策候補</strong><br>${esc(r.act)}</p>
    </div>
    ${src ? `
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">根拠となる過去の記録</h3>
      <p class="cell-sub" style="margin-bottom:var(--space-2)">ACT-220以前で同種の事象が発生しています。</p>
      <div class="quote">
        <p><strong><span class="mono">${esc(src.id)}</span>（${esc(src.date)}・${esc(src.prod)}）</strong></p>
        <p style="margin-top:var(--space-2)">${esc(src.sym)}</p>
        <p style="margin-top:var(--space-3)"><strong>原因</strong><br>${esc(src.cause)}</p>
        <p style="margin-top:var(--space-3)"><strong>恒久対策</strong><br>${esc(src.perm)}</p>
      </div>` : `
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">過去の記録との対応</h3>
      <div class="callout callout--warn">
        <div>
          <p class="callout__title">同種の過去記録はありません</p>
          <p>この心配点は過去実績の検索ではなく、${esc(k ? k.desc : '')}で生成しています。実際に成立するかどうかは、試験または解析での確認が必要です。</p>
        </div>
      </div>`}
    ${r.recheck ? `
      <div class="callout callout--warn" style="margin-top:var(--space-4)">
        <div>
          <p class="callout__title">要再評価</p>
          <p>類似部材の判定で「条件付きで引き継ぐ」を選択したため、この行は過去実績をそのまま適用できません。変更後の条件で再評価してください。</p>
        </div>
      </div>` : ''}`);
}

/* ---- 変更点一覧 ---- */
function renderChanges() {
  $('#chMeta').textContent = `ACT-220からの変更点 ${CHANGES.length} 件　／　登録済みの心配点 ${DATA.DRBFM.length} 件`;
  $('#chBody').innerHTML = CHANGES.map(c => {
    const maxS = Math.max(...c.rows.map(r => r.s));
    return `<tr>
      <td class="col-text"><strong>${esc(c.cp)}</strong></td>
      <td class="col-text cell-sub">${esc(c.why)}</td>
      <td class="nowrap mono">${c.rows.length} 件</td>
      <td class="nowrap"><span class="sod-badge${maxS >= 8 ? ' sod-badge--hi' : ''}">S${maxS}</span></td>
      <td class="nowrap"><button class="btn btn--quiet btn--small" data-goto="gen">生成画面を開く</button></td>
    </tr>`;
  }).join('');
}

/* ---- 登録済みDRBFM ---- */
function renderExisting() {
  const done = DATA.DRBFM.filter(r => r.status === '担当者確認済み').length;
  $('#exMeta').innerHTML = `全 ${DATA.DRBFM.length} 行　／　担当者確認済み <strong>${done} 行</strong>　／　AI提案のまま ${DATA.DRBFM.length - done} 行`;
  $('#exBody').innerHTML = DATA.DRBFM.map((r, i) => `
    <tr>
      <td class="col-text cell-sub">${esc(r.cp)}</td>
      <td class="col-text">${esc(r.worry)}</td>
      <td class="col-text"><strong>${esc(r.mode)}</strong></td>
      <td class="col-text">${esc(r.act)}</td>
      <td class="nowrap">
        <span class="sod-badge${r.s >= 8 ? ' sod-badge--hi' : ''}">S${r.s}</span>
        <span class="sod-badge">O${r.o}</span>
        <span class="sod-badge">D${r.d}</span>
      </td>
      <td class="nowrap">${srcBadge(r.srcKind)}</td>
      <td class="nowrap">${r.status === '担当者確認済み'
        ? '<span class="status status--done">担当者確認済み</span>'
        : '<span class="status status--ai">AI提案</span>'}</td>
      <td class="nowrap">${r.src
        ? `<button class="btn btn--quiet btn--small" data-extr="${esc(r.src)}">過去記録を確認する</button>`
        : '<span class="cell-empty">—</span>'}</td>
    </tr>`).join('');
}

/* ---- 参照文書 ---- */
function renderDocs() {
  const counts = {};
  DATA.DRBFM.forEach(r => counts[r.srcKind] = (counts[r.srcKind] || 0) + 1);
  const refs = {
    past: `不具合記録 ${DATA.TROUBLE_TOTAL.toLocaleString()}件・工程FMEA ${DATA.PFMEA_TOTAL.toLocaleString()}行`,
    func: '製品の機能体系（駆動・電気・熱・シール）と要求仕様書',
    phys: '材料物性表（線膨張・耐熱温度・硬度）とストレス条件（温度サイクル・振動）',
    env: '使用環境シート、車載分野の既知故障モード'
  };
  $('#srcBody').innerHTML = Object.keys(DATA.SRC_KINDS).map(k => `
    <tr>
      <td class="nowrap">${srcBadge(k)}</td>
      <td class="col-text">${esc(DATA.SRC_KINDS[k].desc)}</td>
      <td class="col-text cell-sub">${esc(refs[k])}</td>
      <td class="nowrap">${counts[k] ? `<span class="status status--done">${counts[k]} 件を生成</span>` : '<span class="status status--todo">該当なし</span>'}</td>
    </tr>`).join('');

  $('#docsBody').innerHTML = [
    ['変更発議書（ACT-230）', '発議書', `変更点 ${CHANGES.length} 件`, 'done', '解析完了'],
    ['不具合記録データベース', '社内システム抽出', `${DATA.TROUBLE_TOTAL.toLocaleString()} 件`, 'done', '解析完了'],
    ['工程FMEA', '様式1', `${DATA.PFMEA_TOTAL.toLocaleString()} 行`, 'done', '解析完了'],
    ['製品図面（ACT-220／230）', '図面', `${DATA.DRAWINGS.length} 件`, 'done', '解析完了'],
    ['設計審査記録（DR1〜DR2）', '審査記録', `${DATA.DR_FINDINGS.length} 件の指摘`, 'done', '解析完了'],
    ['材料物性表', '技術資料', '—', 'todo', '未登録'],
    ['試験成績書', '評価記録', '—', 'todo', '未登録']
  ].map(d => `
    <tr>
      <td>${esc(d[0])}</td><td class="nowrap">${esc(d[1])}</td>
      <td class="nowrap mono">${esc(d[2])}</td>
      <td><span class="status status--${d[3]}">${esc(d[4])}</span></td>
    </tr>`).join('');
}

/* ---- 初期化 ---- */
wireShell();
renderChanges();
renderExisting();
renderDocs();

$('#btnSample').addEventListener('click', () => showReadout('変更発議書_ACT-230_20260701.xlsx'));
$('#triggerFile').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (f) showReadout(f.name);
});

$('#genForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!readOk) {
    toast('発議書を読み取ってください', '起点となる変更発議書がまだ読み取られていません。', 'error');
    return;
  }
  const k = selectedKinds();
  if (!k.past && !k.func && !k.phys && !k.env) {
    toast('生成範囲を選択してください', '少なくとも1つの系統を選ぶ必要があります。', 'error');
    return;
  }
  $('#genIdle').hidden = true;
  $('#genResult').hidden = true;
  $('#genLoading').hidden = false;
  $('#genLoadMeta').textContent =
    `対象：ACT-230　／　変更点 ${CHANGES.length} 件　／　参照：不具合記録 ${DATA.TROUBLE_TOTAL.toLocaleString()}件・工程FMEA ${DATA.PFMEA_TOTAL.toLocaleString()}行`;

  // 3段目で類似部材の判定を人に聞く（AIが勝手に決めない）
  runStepsPausable('#genStepper', () => {
    curRows = buildRows();
    edits = 0;
    $('#genLoading').hidden = true;
    renderResult();
    $('#genResult').hidden = false;
  }, 320, 3, resume => {
    openModal(
      '類似部材の判定を確認してください',
      'ACT-230のハウジングは、ACT-220のハウジングから<strong>材質がPBTからPPSへ変更</strong>されています。'
      + '形状は同一ですが材質が異なるため、ACT-220の過去実績をそのまま引き継いでよいかの判断が必要です。'
      + 'この判断で、生成する心配点の範囲が変わります。',
      [
        { label: '同一視して実績を引き継ぐ', rec: false,
          desc: '形状が同じであることを重視し、ACT-220の過去実績をそのまま適用します。材質差による違いは考慮されません。',
          onPick: () => { carryMode = 'keep'; toast('判定を記録しました', '同一視して実績を引き継ぐ、として生成します。'); resume(); } },
        { label: '条件付きで引き継ぐ', rec: true,
          desc: '過去実績は引き継ぎつつ、該当する行に「要再評価」を付けます。材質差の影響を後で確認できます。',
          onPick: () => { carryMode = 'cond'; toast('判定を記録しました', '条件付きで引き継ぐ、として生成します。該当行に要再評価を付けます。', 'warn'); resume(); } },
        { label: '別部材として扱う', rec: false,
          desc: '過去実績は使わず、機能演繹と物理推論のみで心配点を生成します。過去の知見は引き継がれません。',
          onPick: () => { carryMode = 'sep'; toast('判定を記録しました', '別部材として扱う、として生成します。過去実績由来の行は除外されます。', 'warn'); resume(); } }
      ]);
  });
});

document.addEventListener('click', e => {
  const ev = e.target.closest('[data-ev]');
  if (ev) { openEv(ev.dataset.ev); return; }
  const et = e.target.closest('[data-extr]');
  if (et) {
    const t = TR_BY_ID[et.dataset.extr];
    if (!t) return;
    openPanel('過去記録：' + t.id, `
      <dl class="meta-list">
        <dt>管理番号</dt><dd class="mono">${esc(t.id)}</dd>
        <dt>発生日 ／ 製品</dt><dd class="mono">${esc(t.date)}　${esc(t.prod)}</dd>
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

$('#btnExCsv').addEventListener('click', () => {
  downloadCsv(`登録済みDRBFM_${today()}.csv`, [
    ['変更点', '変更理由', '心配点', '故障モード', '影響', '対策', 'S', 'O', 'D', 'RPN', '生成系統', '確認状態'],
    ...DATA.DRBFM.map(r => [r.cp, r.why, r.worry, r.mode, r.eff, r.act, r.s, r.o, r.d,
      r.s * r.o * r.d, DATA.SRC_KINDS[r.srcKind] ? DATA.SRC_KINDS[r.srcKind].label : r.srcKind, r.status])
  ]);
  toast('CSVを出力しました', `${DATA.DRBFM.length} 行を出力しました。`);
});
