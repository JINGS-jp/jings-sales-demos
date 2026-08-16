/* デモ8：FTA（故障の木解析）— 5M1Eで原因を分岐させる
   起点は必ず「現象（結果）」。工程から始めると原因の分類ができない。
   要点は3つ。
   ・原因を 人・設備・材料・方法・測定・環境 の6分類へ振り分ける
   ・候補が挙がらなかった分類も枠として残す。掘り下げの偏りを見せるのがAIの価値
   ・各原因に過去不具合・工程FMEAの実績を紐づけ、実績と推定を分ける */

const TR_BY_ID = {};
DATA.TROUBLES.forEach(t => TR_BY_ID[t.id] = t);
const PROC_BY_NO = {};
DATA.PROCESSES.forEach(p => PROC_BY_NO[p.no] = p);
const procLabel = no => PROC_BY_NO[no] ? `工程${no} ${PROC_BY_NO[no].name}` : `工程${no}`;
const TREE_BY_ID = {};
DATA.FTA_TREES.forEach(t => TREE_BY_ID[t.id] = t);
const M_BY_KEY = {};
DATA.M1E.forEach(m => M_BY_KEY[m.key] = m);

let curTree = null;

/* 現象ごとに、6分類それぞれの原因をまとめる（候補0件の分類も残す） */
function groupByM1E(tree) {
  return DATA.M1E.map(m => ({
    m, causes: tree.causes.filter(c => c.m === m.key)
  }));
}

/* ---- 木の描画（左から右へ：現象 → 6分類 → 原因） ---- */
const TOPW = 220, GATEW = 210, CAUW = 330, RH = 62, RGAP = 10, COLGAP = 52;

/* 故障の木を描く。
   頂上事象 → 中間事象（論理ゲート） → 基本事象 の3階層。
   5M1Eは基本事象に付ける分類で、木の階層ではない。分類の抜けは木の下の表で見る。 */
function treeSvg() {
  const gates = curTree.gates.map(g => ({
    g, causes: curTree.causes.filter(c => c.g === g.id)
  }));

  // 各中間事象の高さは、ぶら下がる基本事象の数で決まる
  let y = 0;
  const rows = gates.map(r => {
    const n = Math.max(1, r.causes.length);
    const h = n * RH + (n - 1) * RGAP;
    const o = { ...r, y, h, cy: y + h / 2 };
    y += h + RGAP * 3;
    return o;
  });
  const H = Math.max(y, 160);
  const x0 = 0, x1 = TOPW + COLGAP, x2 = x1 + GATEW + COLGAP;
  const W = x2 + CAUW + 8;
  const topCy = H / 2;

  const links = rows.map(r => {
    const mx = x0 + TOPW + COLGAP / 2;
    const toGate = `<path class="lk" d="M${x0 + TOPW} ${topCy} H${mx} V${r.cy} H${x1}"/>`;
    const toCause = r.causes.map((c, i) => {
      const cy = r.y + i * (RH + RGAP) + RH / 2;
      const mx2 = x1 + GATEW + COLGAP / 2;
      return `<path class="lk" d="M${x1 + GATEW} ${r.cy} H${mx2} V${cy} H${x2}"/>`;
    }).join('');
    return toGate + toCause;
  }).join('');

  const topBox = `<g class="node" tabindex="0" role="button" data-node="top"
      aria-label="頂上事象の詳細を見る">
    <rect class="bx bx--top" x="${x0}" y="${topCy - 46}" width="${TOPW}" height="92"/>
    <text x="${x0 + TOPW / 2}" y="${topCy - 24}" text-anchor="middle"
      style="font-size:14px;fill:var(--color-error)">頂上事象</text>
    ${wrapText(curTree.top, 13).map((t, i) => `<text x="${x0 + TOPW / 2}"
      y="${topCy - 4 + i * 18}" text-anchor="middle">${esc(t)}</text>`).join('')}
  </g>`;

  // 中間事象。ORゲートの記号を左に添える。
  const gateBoxes = rows.map(r => `
    <g class="node" tabindex="0" role="button" data-gate="${esc(r.g.id)}"
       aria-label="${esc(r.g.label)}の中間事象を見る">
      <rect class="bx bx--inter" x="${x1}" y="${r.cy - 34}" width="${GATEW}" height="68"/>
      <text x="${x1 + 10}" y="${r.cy - 16}" style="font-size:13px;fill:var(--color-primary)">中間事象　${esc(r.g.op)}</text>
      ${wrapText(r.g.label, 15).slice(0, 2).map((t, i) => `<text x="${x1 + 10}"
        y="${r.cy + 4 + i * 18}">${esc(t)}</text>`).join('')}
      <text x="${x1 + GATEW - 8}" y="${r.cy + 26}" text-anchor="end"
        style="font-size:13px;fill:var(--color-text-secondary)">${r.causes.length} 件</text>
    </g>`).join('');

  // 基本事象。5M1Eの分類と、実績の有無をここに出す。
  const cauBoxes = rows.map(r => r.causes.map((c, i) => {
    const cy = r.y + i * (RH + RGAP) + RH / 2;
    const hit = !!c.tr && $('#lkTr').checked;
    const idx = curTree.causes.indexOf(c);
    const m = M_BY_KEY[c.m];
    const marked = curConds.includes(c.m);
    return `<g class="node" tabindex="0" role="button" data-cause="${idx}"
        aria-label="${esc(c.label)}の根拠を見る">
      <rect class="bx bx--basic" x="${x2}" y="${cy - RH / 2}" width="${CAUW}" height="${RH}"/>
      ${hit ? `<rect class="bx-flag" x="${x2 + 1.5}" y="${cy - RH / 2 + 1.5}" width="4" height="${RH - 3}"/>` : ''}
      <text x="${x2 + 12}" y="${cy - RH / 2 + 17}"
        style="font-size:13px;fill:${marked ? 'var(--color-warning)' : 'var(--color-text-secondary)'}">${esc(m ? m.label : c.m)}${marked ? '　◆' : ''}</text>
      ${wrapText(c.label, 21).slice(0, 2).map((t, k) => `<text x="${x2 + 12}"
        y="${cy - RH / 2 + 36 + k * 17}">${esc(t)}</text>`).join('')}
      <text x="${x2 + CAUW - 10}" y="${cy - RH / 2 + 17}" text-anchor="end"
        style="font-size:13px;fill:var(--color-text-secondary)">${hit ? '関連記録あり' : '実績なし'}</text>
    </g>`;
  }).join('')).join('');

  return `<div class="fta"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
      role="img" aria-label="${esc(curTree.top)}の故障の木">
    ${links}${topBox}${gateBoxes}${cauBoxes}
  </svg></div>
  <div class="fta-legend">
    <span><i style="border-color:var(--color-error)"></i>頂上事象</span>
    <span><i style="border-color:var(--color-primary)"></i>中間事象（論理ゲート）</span>
    <span><i style="border-color:var(--color-border)"></i>基本事象</span>
    <span><i style="background:var(--color-background-muted);border-color:var(--color-border)"></i>分類（候補なし）</span>
    <span><i style="background:var(--color-warning-bg);border-color:var(--color-warning)"></i>原因（過去実績あり）</span>
    <span><i style="background:var(--color-background);border-color:var(--color-border)"></i>原因（実績なし・推定）</span>
  </div>`;
}

function wrapText(s, n) {
  const out = [];
  let cur = '';
  for (const ch of String(s)) {
    cur += ch;
    if (cur.length >= n) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out.slice(0, 3);
}

/* ---- 結果 ---- */
function renderTree() {
  const groups = groupByM1E(curTree);
  const empty = groups.filter(g => !g.causes.length);
  const useTr = $('#lkTr').checked, useFm = $('#lkFm').checked;
  // 参照を外した実績は紐づけない（発生度がすべて推定になる）
  const withTr = useTr ? curTree.causes.filter(c => c.tr) : [];
  const noFmea = useFm ? curTree.causes.filter(c => !c.fmea) : curTree.causes;
  const seed = curTree.seed ? TR_BY_ID[curTree.seed] : null;

  $('#ftResult').innerHTML = `
    <div class="card" style="border-left:4px solid var(--color-primary)">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
        <span class="status status--done">展開完了</span>
        <span class="cell-sub mono">${esc(curTree.id)}</span>
        <span class="cell-sub">${esc(curTree.prod)}　／　${today()}</span>
      </div>
      <h2 style="font-size:var(--font-subsection-title);margin-bottom:var(--space-2)">現象：${esc(curTree.top)}</h2>
      <p class="cell-sub" style="margin-bottom:var(--space-4)">${esc(curTree.scope)}</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--space-4);margin-bottom:var(--space-4)">
        <div><p class="kpi__label">原因の候補</p><p class="kpi__value" style="font-size:var(--font-section-title)">${curTree.causes.length}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">関連する過去記録あり</p><p class="kpi__value" style="font-size:var(--font-section-title)">${withTr.length}<span class="kpi__unit"> 件</span></p><p class="kpi__note">残り ${curTree.causes.length - withTr.length} 件は推定</p></div>
        <div><p class="kpi__label">候補なしの分類</p><p class="kpi__value" style="font-size:var(--font-section-title)">${empty.length}<span class="kpi__unit"> / 6</span></p><p class="kpi__note">${empty.length ? esc(empty.map(g => g.m.label).join('・')) : 'すべての分類に候補あり'}</p></div>
        <div><p class="kpi__label">対応するFMEA行が未特定</p><p class="kpi__value" style="font-size:var(--font-section-title)">${noFmea.length}<span class="kpi__unit"> 件</span></p></div>
      </div>
      <p style="line-height:var(--line-height-body)">
        現象から原因を ${curTree.causes.length} 件挙げ、5M1Eの6分類に振り分けました。
        うち ${withTr.length} 件は過去に発生実績があります（黄色の枠）。
        ${empty.length
          ? `<strong>「${esc(empty.map(g => g.m.label).join('」「'))}」には候補が挙がっていません。</strong>この分類に本当に原因がないのか、まだ見ていないだけなのかを確認してください。`
          : '6分類すべてに候補が挙がっています。'}
      </p>
      ${seed ? `<p style="margin-top:var(--space-3)" class="cell-sub">この現象の起点となった記録：<span class="mono">${esc(seed.id)}</span>（${esc(seed.date)}）
        <button class="btn btn--quiet btn--small" data-tr="${esc(seed.id)}" style="margin-left:var(--space-2)">記録を確認する</button></p>` : ''}
    </div>

    <div class="section">
      <h2 class="section__title">故障の木</h2>
      <p class="section__lead">左が頂上事象、中央が中間事象（論理ゲート）、右が基本事象です。枠を押すと根拠と紐づく記録を確認できます。</p>
      ${treeSvg()}
    </div>

    <div class="section">
      <h2 class="section__title">基本事象の5M1E分類（抜けの確認）</h2>
      <p class="section__lead">木に出た基本事象を、人・設備・材料・方法・測定・環境に振り分けた結果です。候補が挙がらなかった分類も残します。この分類に原因がないと言い切ってよいかを確かめてください。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">基本事象の5M1E分類</caption>
          <thead><tr>
            <th scope="col">分類</th><th scope="col">この分類が扱う範囲</th>
            <th scope="col">基本事象</th><th scope="col">状態</th>
          </tr></thead>
          <tbody>${groups.map(g => `
            <tr data-cat="${esc(g.m.key)}">
              <td class="nowrap"><strong>${esc(g.m.label)}</strong>${curConds.includes(g.m.key)
                ? '<div style="margin-top:var(--space-1)"><span class="status status--warn">入力に手がかりあり</span></div>' : ''}
                <div class="cell-sub">${esc(g.m.en)}</div></td>
              <td class="col-text cell-sub">${esc(g.m.desc)}</td>
              <td class="col-text">${g.causes.length
                ? g.causes.map(c => esc(c.label)).join('<br>')
                : '<span class="cell-empty">候補が挙がっていません</span>'}</td>
              <td class="nowrap">${g.causes.length
                ? `<span class="status status--done">${g.causes.length} 件</span>`
                : '<span class="status status--risk">候補なし</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${empty.length ? `
    <div class="section">
      <h2 class="section__title">候補が挙がっていない分類</h2>
      <p class="section__lead">過去の記録に出てこないだけで、実際は原因になっていることがあります。掘り下げが済んでいるかを確認してください。</p>
      ${empty.filter(g => curConds.includes(g.m.key)).length ? `
        <div class="callout callout--error" style="margin-bottom:var(--space-4)">
          <div>
            <p class="callout__title">優先して確認したい観点があります</p>
            <p>${esc(empty.filter(g => curConds.includes(g.m.key)).map(g => g.m.label).join('・'))}
            について、入力内容に手がかりがありますが、過去の記録には対応する原因候補が見つかりませんでした。
            未検討の可能性があるため、優先して確認してください。</p>
          </div>
        </div>` : ''}
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">候補が挙がっていない分類</caption>
          <thead><tr>
            <th scope="col">分類</th><th scope="col">この分類が扱う範囲</th>
            <th scope="col">確認すべきこと</th><th scope="col">操作</th>
          </tr></thead>
          <tbody>${empty.map(g => `
            <tr>
              <td class="nowrap"><strong>${esc(g.m.label)}</strong>${curConds.includes(g.m.key)
                ? '<div style="margin-top:var(--space-1)"><span class="status status--risk">文章に手がかりあり</span></div>' : ''}
                <div class="cell-sub">${esc(g.m.en)}</div></td>
              <td class="col-text cell-sub">${esc(g.m.desc)}</td>
              <td class="col-text">${esc(emptyHint(g.m.key))}</td>
              <td class="nowrap"><button class="btn btn--quiet btn--small" data-addcat="${esc(g.m.key)}">この分類を検討対象に加える</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <div class="section">
      <h2 class="section__title">原因と紐づく実績</h2>
      <p class="section__lead">各原因に、過去不具合と工程FMEAの実績を紐づけています。実績がない原因は発生度を推定として扱ってください。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">原因と紐づく実績</caption>
          <thead><tr>
            <th scope="col">分類</th><th scope="col">原因</th><th scope="col">補足</th>
            <th scope="col">発生度O</th><th scope="col">過去不具合</th>
            <th scope="col">工程FMEA</th><th scope="col">根拠</th>
          </tr></thead>
          <tbody>${curTree.causes.map((c, i) => `
            <tr>
              <td class="nowrap">${esc(M_BY_KEY[c.m].label)}</td>
              <td class="col-text"><strong>${esc(c.label)}</strong></td>
              <td class="col-text cell-sub">${esc(c.note)}</td>
              <td class="nowrap">${c.o != null ? `<span class="sod-badge">O${c.o}</span>` : '<span class="status status--todo">未評価</span>'}
                <div class="cell-sub">${(useTr && c.tr) ? '実績あり' : '推定'}</div></td>
              <td class="nowrap">${(useTr && c.tr) ? `<span class="mono">${esc(c.tr)}</span>` : '<span class="cell-empty">—</span>'}</td>
              <td class="nowrap">${(useFm && c.fmea) ? esc(procLabel(c.fmea))
                : '<span class="status status--todo">登録なし</span>'}</td>
              <td class="nowrap"><button class="btn btn--quiet btn--small" data-cause="${i}">根拠を確認する</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);flex-wrap:wrap">
        <button class="btn btn--primary" id="btnFtCsv">原因の分岐をExcelで出力する</button>
        <button class="btn btn--secondary" id="btnToFmea">工程FMEAへの反映イメージを見る</button>
      </div>
    </div>

    <div class="callout callout--warn">
      <div>
        <p class="callout__title">この結果を使うときの注意</p>
        <p>原因の候補は過去の記録から集めたものです。これで全部とは言えません。候補が出なかった分類は「原因がない」ではなく「記録に出てこない」だけです。発生度は、実際に起きた記録があるものは記録から、ないものは推定です。最終的な原因判定は、現物・現場の確認結果を踏まえて担当者が行ってください。</p>
      </div>
    </div>`;

  $('#btnFtCsv').addEventListener('click', exportTree);
  $('#btnToFmea').addEventListener('click', () => {
    toast('反映を依頼しました',
      `工程FMEAに登録がない ${noFmea.length} 件について、生産技術部へ検討依頼を作成しました。`);
  });
}

function emptyHint(key) {
  const map = {
    man: '作業者の交代・多能工化・教育の状況で発生し得ないかを確認する',
    mach: '設備・治具・工具の劣化や個体差で発生し得ないかを確認する',
    matl: '材料ロット差・仕入先変更・保管状態で発生し得ないかを確認する',
    meth: '作業標準・条件表の記載の不足で発生し得ないかを確認する',
    meas: '測定器の精度・判定基準の曖昧さで発生し得ないかを確認する',
    envi: '温度・湿度・騒音・清浄度・季節変動で発生し得ないかを確認する'
  };
  return map[key] || '';
}

function exportTree() {
  downloadXlsx(`FTA_5M1E_${curTree.id}_${today()}.xlsx`, [
    ['現象ID', '現象', '対象製品', '範囲', '起点の記録'],
    [curTree.id, curTree.top, curTree.prod, curTree.scope, curTree.seed || ''],
    [],
    ['分類', '分類（英）', '原因', '補足', '発生度O', '発生度の根拠', '過去不具合', '工程FMEA'],
    ...curTree.causes.map(c => [M_BY_KEY[c.m].label, M_BY_KEY[c.m].en, c.label, c.note,
      c.o != null ? c.o : '未評価', c.tr ? '関連する過去記録あり' : '記録なし', c.tr || '', c.fmea ? procLabel(c.fmea) : '登録なし']),
    [],
    ['候補が挙がっていない分類', '扱う範囲', '確認すべきこと'],
    ...groupByM1E(curTree).filter(g => !g.causes.length)
      .map(g => [g.m.label, g.m.desc, emptyHint(g.m.key)])
  ]);
  toast('原因の分岐を出力しました',
    `原因 ${curTree.causes.length} 件と、候補なしの分類を含めて出力しました。`);
}

/* ---- 根拠パネル ---- */
function openCause(i) {
  const c = curTree.causes[i];
  if (!c) return;
  const m = M_BY_KEY[c.m];
  const tr = c.tr ? TR_BY_ID[c.tr] : null;
  const fmeaRows = c.fmea ? DATA.PFMEA.filter(r => r.proc === c.fmea) : [];

  openPanel('原因：' + c.label, `
    <dl class="meta-list">
      <dt>現象</dt><dd>${esc(curTree.top)}</dd>
      <dt>分類</dt><dd>${esc(m.label)}（${esc(m.en)}）　／　${esc(m.desc)}</dd>
      <dt>発生度O</dt><dd>${c.o != null
        ? `<span class="mono">O${c.o}</span>　（関連する過去記録から引き当て）`
        : '未評価（引き当てられる過去記録がないため、点数は出していません）'}</dd>
    </dl>
    <div class="quote" style="margin-top:var(--space-4)"><p>${esc(c.note)}</p></div>
    ${tr ? `
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">紐づく過去不具合</h3>
      <div class="quote">
        <p><strong><span class="mono">${esc(tr.id)}</span>（${esc(tr.date)}・${esc(tr.prod)}・${esc(procLabel(tr.proc))}）</strong></p>
        <p style="margin-top:var(--space-2)">${esc(tr.sym)}</p>
        <p style="margin-top:var(--space-3)"><strong>原因</strong><br>${esc(tr.cause)}</p>
        <p style="margin-top:var(--space-3)"><strong>恒久対策</strong><br>${esc(tr.perm)}</p>
        <p style="margin-top:var(--space-3)"><strong>評価</strong><br><span class="mono">S${tr.s}　O${tr.o}　D${tr.d}</span>${tr.leak ? '　／　顧客流出あり' : ''}</p>
      </div>
      ${sheetShot('complaint', '苦情報告書（品質苦情処理規定 QR-2201）',
        'この原因の発生度は、この帳票に記録された実績から取っています。')}` : `
      <div class="callout callout--warn" style="margin-top:var(--space-4)">
        <div>
          <p class="callout__title">紐づく過去不具合はありません</p>
          <p>この原因は実際に起きた記録がないので、発生度は推定です。構造上まず起きないのか、たまたままだ起きていないだけなのかは、担当者が判断してください。</p>
        </div>
      </div>`}
    ${fmeaRows.length ? `
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">同じ工程の関連する工程FMEA</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col">故障モード</th><th scope="col">現行の検出</th><th scope="col">S・O・D</th></tr></thead>
          <tbody>${fmeaRows.map(r => `
            <tr>
              <td class="col-text">${esc(r.mode)}</td>
              <td class="col-text">${esc(r.det)}</td>
              <td class="nowrap mono">S${r.s} O${r.o} D${r.d}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${sheetShot('pfmea', '工程FMEA ACT-220 Ver.09（様式1）',
        '同じ工程に登録されている行です。この原因と対応が取れているかを確認します。')}` : `
      <div class="callout callout--warn" style="margin-top:var(--space-4)">
        <div>
          <p class="callout__title">工程FMEAに対応する行がありません</p>
          <p>工程単位では拾いにくかった観点の候補です。工程FMEAへ追加すべきかを検討してください。</p>
        </div>
      </div>`}`);
}

function openCat(key) {
  const m = M_BY_KEY[key];
  const causes = curTree.causes.filter(c => c.m === key);
  openPanel('分類：' + m.label + '（' + m.en + '）', `
    <dl class="meta-list">
      <dt>この分類が扱う範囲</dt><dd>${esc(m.desc)}</dd>
      <dt>この現象での候補</dt><dd>${causes.length ? causes.length + ' 件' : '候補なし'}</dd>
    </dl>
    ${causes.length ? `
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">挙がっている原因</h3>
      <ul style="margin:0;padding-left:1.2em;line-height:var(--line-height-body)">
        ${causes.map(c => `<li>${esc(c.label)}　<span class="cell-sub">（${c.o != null ? 'O' + c.o : '未評価'}・${c.tr ? '関連記録あり' : '記録なし'}）</span></li>`).join('')}
      </ul>` : `
      <div class="callout callout--warn" style="margin-top:var(--space-4)">
        <div>
          <p class="callout__title">この分類には候補が挙がっていません</p>
          <p>${esc(emptyHint(key))}</p>
          <p style="margin-top:var(--space-2)">過去の記録に登場しないだけで、原因になり得ないとは限りません。担当者が確認してください。</p>
        </div>
      </div>`}`);
}

function openTop() {
  const seed = curTree.seed ? TR_BY_ID[curTree.seed] : null;
  const groups = groupByM1E(curTree);
  openPanel('現象：' + curTree.top, `
    <dl class="meta-list">
      <dt>現象ID</dt><dd class="mono">${esc(curTree.id)}</dd>
      <dt>対象製品</dt><dd>${esc(curTree.prod)}</dd>
      <dt>対象とする範囲</dt><dd>${esc(curTree.scope)}</dd>
    </dl>
    <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">分類ごとの候補数</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th scope="col">分類</th><th scope="col">候補</th></tr></thead>
        <tbody>${groups.map(g => `
          <tr>
            <td class="nowrap">${esc(g.m.label)}</td>
            <td class="nowrap">${g.causes.length
              ? g.causes.length + ' 件'
              : '<span class="status status--warn">候補なし</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${seed ? `
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">この現象の起点となった記録</h3>
      <div class="quote">
        <p><strong><span class="mono">${esc(seed.id)}</span>（${esc(seed.date)}）</strong></p>
        <p style="margin-top:var(--space-2)">${esc(seed.sym)}</p>
      </div>` : ''}`);
}

/* ---- 原因一覧 ---- */
function allCauses() {
  const out = [];
  DATA.FTA_TREES.forEach(tree => tree.causes.forEach(c => out.push({ tree, c })));
  return out;
}

function renderBasic() {
  const rows = allCauses();
  const est = rows.filter(x => !x.c.tr).length;
  $('#basicMeta').innerHTML =
    `全 ${rows.length} 件　／　関連する過去記録あり ${rows.length - est} 件・<strong>記録なし ${est} 件</strong>`;
  $('#basicBody').innerHTML = rows.map(({ tree, c }) => `
    <tr>
      <td class="col-text cell-sub">${esc(tree.top)}</td>
      <td class="nowrap">${esc(M_BY_KEY[c.m].label)}</td>
      <td class="col-text"><strong>${esc(c.label)}</strong></td>
      <td class="col-text cell-sub">${esc(c.note)}</td>
      <td class="nowrap">${c.o != null ? `<span class="sod-badge">O${c.o}</span>` : '<span class="status status--todo">未評価</span>'}
        <div class="cell-sub">${c.tr ? '実績あり' : '推定'}</div></td>
      <td class="nowrap">
        ${c.tr ? `<span class="mono cell-sub">${esc(c.tr)}</span><br>` : ''}
        ${c.fmea ? `<span class="cell-sub">${esc(procLabel(c.fmea))}</span>`
          : '<span class="status status--todo">FMEA登録なし</span>'}</td>
      <td class="nowrap">${c.tr
        ? `<button class="btn btn--quiet btn--small" data-tr="${esc(c.tr)}">記録を確認する</button>`
        : '<span class="cell-empty">—</span>'}</td>
    </tr>`).join('');
  return rows;
}

/* ---- FMEAとの関係 ---- */
function renderCompare() {
  $('#cmpFmea').textContent =
    `${DATA.PFMEA_TOTAL.toLocaleString()} 行（${DATA.PROCESSES.length} 工程）`;
  const emptyTotal = DATA.FTA_TREES.reduce(
    (a, t) => a + groupByM1E(t).filter(g => !g.causes.length).length, 0);
  $('#cmpFta').textContent =
    `${DATA.FTA_TREES.length} 件の現象・原因 ${allCauses().length} 件　／　候補なしの分類 ${emptyTotal} 件`;

  const gaps = allCauses().filter(x => !x.c.fmea);
  $('#gapBody').innerHTML = gaps.length ? gaps.map(({ tree, c }) => `
    <tr>
      <td class="col-text cell-sub">${esc(tree.top)}</td>
      <td class="nowrap">${esc(M_BY_KEY[c.m].label)}</td>
      <td class="col-text"><strong>${esc(c.label)}</strong><div class="cell-sub">${esc(c.note)}</div></td>
      <td class="col-text">${esc(gapReason(c))}</td>
      <td class="nowrap"><button class="btn btn--quiet btn--small" data-toproc="${esc(tree.id)}|${esc(tree.causes.indexOf(c))}">工程FMEAへの追加を検討する</button></td>
    </tr>`).join('')
    : `<tr><td colspan="5" class="cell-empty">工程FMEAに登録がない原因はありません</td></tr>`;
}

function gapReason(c) {
  if (c.m === 'meas') return '測定していないこと自体を故障モードとして立てていない';
  if (c.m === 'envi') return '環境条件は特定の工程に属さないため、工程単位では扱われにくい';
  if (c.m === 'man') return '作業条件による発生のため、工程FMEAでは原因欄に埋もれやすい';
  return '複数の工程・部門にまたがる事象のため、工程単位では拾いにくい';
}

/* ---- 参照文書 ---- */
function renderDocs() {
  const rows = [
    ['不具合記録データベース', '社内システム抽出', '原因の発生実績と発生度の根拠', 'done', '解析完了'],
    ['工程FMEA', '様式1', '原因と工程FMEA行の対応付け', 'done', '解析完了'],
    ['苦情報告書', '苦情処理帳票', '発生事象・原因・対策の原文', 'done', '解析完了'],
    ['設計変更通知（ECN）', '変更管理帳票', '対策として設計変更した実績', 'done', '解析完了'],
    ['検査記録（測定値）', '検査記録', '測定に関する原因の発生率。未登録のため推定', 'todo', '未登録'],
    ['作業要領書', '作業標準', '人・方法に関する原因の裏取り。未登録', 'todo', '未登録'],
    ['環境測定記録', '環境記録', '環境に関する原因の裏取り。未登録', 'todo', '未登録']
  ];
  $('#docsBody').innerHTML = rows.map(r => `
    <tr>
      <td>${esc(r[0])}</td><td class="nowrap">${esc(r[1])}</td>
      <td class="col-text cell-sub">${esc(r[2])}</td>
      <td><span class="status status--${r[3]}">${esc(r[4])}</span></td>
    </tr>`).join('');
}

/* ---- 実行 ---- */
function runTree(id) {
  curTree = TREE_BY_ID[id];
  $('#topSelect').value = id;
  $('#topError').hidden = true;
  $('#topSelect').removeAttribute('aria-invalid');
  $('#ftIdle').hidden = true;
  $('#ftResult').hidden = true;
  $('#ftLoading').hidden = false;
  $('#ftLoadMeta').textContent =
    `現象：${curTree.top}　／　参照：不具合記録 ${DATA.TROUBLE_TOTAL.toLocaleString()}件・工程FMEA ${DATA.PFMEA_TOTAL.toLocaleString()}行`;
  runSteps('#ftStepper', () => {
    $('#ftLoading').hidden = true;
    renderTree();
    $('#ftResult').hidden = false;
  }, 320);
}

/* ---- 初期化 ---- */
wireShell();
renderBasic();
renderCompare();
renderDocs();

DATA.FTA_TREES.forEach(t => {
  const o = document.createElement('option');
  o.value = t.id;
  o.textContent = `${t.top}（${t.prod}）`;
  $('#topSelect').appendChild(o);
});

/* ===== 文章から現象を読み取る ==============================
   起きていることを普段の言葉で書いてもらい、頂上に置く現象を決める。
   一致が弱いときは勝手に決めず、候補を出して人に選んでもらう。
   あわせて、文章の中の手がかり語から「どの分類を重点的に見るか」を拾う。 */

function ftNorm(s) { return (s || '').toLowerCase().replace(/[\s　・、。（）()「」\.,]/g, ''); }
function ftGrams(s) {
  const n = ftNorm(s), g = [];
  for (let i = 0; i < n.length - 1; i++) g.push(n.slice(i, i + 2));
  return g;
}
function ftDice(a, b) {
  const A = ftGrams(a), B = ftGrams(b);
  if (!A.length || !B.length) return 0;
  const bag = {};
  B.forEach(g => bag[g] = (bag[g] || 0) + 1);
  let hit = 0;
  A.forEach(g => { if (bag[g] > 0) { bag[g]--; hit++; } });
  return 2 * hit / (A.length + B.length);
}

/* 文章に出てきたら、その分類を重点的に見る手がかりになる語 */
const COND_HINTS = [
  { m: 'envi', words: ['低温', '高温', '寒', '暑', '湿度', '結露', '冬', '夏', '屋外', '粉じん', 'ほこり', '温度', '朝一'] },
  { m: 'matl', words: ['ロット', '材質', '樹脂', '材料', '部品', '仕入', 'グリス', 'ゴム', '硬度', '粘度', '受入', 'メーカ'] },
  { m: 'man', words: ['新人', '応援', '交代', '経験', '慣れ', '夜勤', '残業', '人手', '作業者', '手作業', '教育'] },
  { m: 'mach', words: ['治具', '設備', '装置', '機械', '摩耗', '交換', 'メンテ', '工具', '段取', '金型', '刃', '経年'] },
  { m: 'meth', words: ['手順', '標準', '条件', '指示', '要領', '設定', '変更', 'トルク', '速度', '順序', '締付'] },
  { m: 'meas', words: ['検査', '測定', 'ゲージ', '校正', '判定', '基準', '抜取', '全数', '公差', '見逃'] }
];

let curConds = [];   // 文章から拾った手がかり（分類キーの配列）

const SIT_SAMPLE = 'ACT-220の最終組立で、ケースの合わせ面から異音が出ているという連絡が入った。'
  + '朝一番の立ち上げ直後に多いように見える。先週、締付の治具を交換している。'
  + '今のところ検査では止められておらず、後工程で見つかっている。';

/* 文章を読み取って、頂上事象と手がかりを返す */
function readSituation(text) {
  const scored = DATA.FTA_TREES.map(t => ({
    t, score: Math.max(ftDice(text, t.top), ftDice(text, t.top + t.prod))
  })).sort((a, b) => b.score - a.score);

  const conds = COND_HINTS
    .map(h => ({ m: h.m, hit: h.words.filter(w => text.includes(w)) }))
    .filter(c => c.hit.length);

  return { scored, conds };
}

function showReadout(best, scored, conds, decided) {
  const M = {}; DATA.M1E.forEach(m => M[m.key] = m);
  $('#sitReadout').hidden = false;
  $('#sitReadout').innerHTML = `
    <div class="callout callout--info">
      <div>
        <p class="callout__title">文章から読み取りました</p>
        <dl class="meta-list" style="margin-top:var(--space-2)">
          <dt>頂上に置く現象</dt><dd>${esc(best.t.top)}</dd>
          <dt>対象</dt><dd>${esc(best.t.prod)}</dd>
          <dt>文面の一致</dt><dd>${best.score >= 0.25 ? '高' : best.score >= 0.12 ? '中' : '低'}${decided ? '（現象は人が選択）' : ''}</dd>
        </dl>
        ${conds.length ? `
          <p style="margin-top:var(--space-3);font-size:var(--font-caption)">
            文章の中に、次の分類の手がかりがありました。木の中で印を付けます。</p>
          <p style="margin-top:var(--space-1)">
            ${conds.map(c => `<span class="status status--warn" style="margin-right:var(--space-2)">${esc(M[c.m].label)}：${esc(c.hit.join('・'))}</span>`).join('')}
          </p>`
        : `<p style="margin-top:var(--space-3);font-size:var(--font-caption)">
             分類を絞り込める手がかりは、文章の中にありませんでした。6分類を平らに見ます。</p>`}
        <p style="margin-top:var(--space-3);font-size:var(--font-caption)">
          読み取りが違っていれば、下の「現象」で選び直してください。
        </p>
      </div>
    </div>`;
}

function applyRead(text) {
  const { scored, conds } = readSituation(text);
  const best = scored[0];

  const go = (pick, decided) => {
    curConds = conds.map(c => c.m);
    $('#topSelect').value = pick.t.id;
    $('#topError').hidden = true;
    showReadout(pick, scored, conds, decided);
    toast('現象を読み取りました', pick.t.top);
  };

  // 近さが足りないときは決め打ちしない。候補を出して人に選んでもらう。
  if (best.score < 0.14) {
    openModal('どの現象として扱いますか',
      '書かれた内容に近い現象を、登録済みのものから決められませんでした。'
      + 'AIが勝手に決めると、木の頂上が実際とずれます。近いものを選んでください。',
      scored.slice(0, 3).map(x => ({
        label: x.t.top,
        desc: `${x.t.prod}　文面の一致：${x.score >= 0.25 ? '高' : x.score >= 0.12 ? '中' : '低'}`,
        onPick: () => go(x, true)
      })));
    return;
  }
  go(best, false);
}

$('#btnSitSample').addEventListener('click', () => {
  $('#sitText').value = SIT_SAMPLE;
  $('#sitText').focus();
});
$('#btnSitRead').addEventListener('click', () => {
  const t = $('#sitText').value.trim();
  if (!t) {
    toast('文章が空です', '起きていることを書いてから読み取ってください。', 'error');
    $('#sitText').focus();
    return;
  }
  applyRead(t);
});

$('#topSelect').addEventListener('change', () => {
  // 文章と別の現象を選んだら、文章から拾った手がかりは持ち越さない
  const cur = $('#topSelect').value;
  const read = $('#sitReadout');
  if (!read.hidden && cur && !read.textContent.includes((TREE_BY_ID[cur] || {}).top || '\u0000')) {
    curConds = [];
    read.hidden = true;
  }
});

$('#ftForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('#topSelect').value;
  if (!id) {
    $('#topError').hidden = false;
    $('#topSelect').setAttribute('aria-invalid', 'true');
    toast('現象を選択してください', '現象を選ぶと、原因を5M1Eに分けて展開できます。', 'error');
    return;
  }
  runTree(id);
});

$('#btnBasicCsv').addEventListener('click', () => {
  const rows = renderBasic();
  downloadXlsx(`FTA原因一覧_${today()}.xlsx`, [
    ['現象', '分類', '原因', '補足', '発生度O', '発生度の根拠', '過去不具合', '工程FMEA'],
    ...rows.map(({ tree, c }) => [tree.top, M_BY_KEY[c.m].label, c.label, c.note,
      c.o != null ? c.o : '未評価', c.tr ? '関連する過去記録あり' : '記録なし',
      c.tr || '', c.fmea ? procLabel(c.fmea) : '未特定'])
  ]);
  toast('Excelを出力しました', `${rows.length} 件の原因を出力しました。`);
});

document.addEventListener('click', e => {
  const cz = e.target.closest('[data-cause]');
  if (cz) { openCause(Number(cz.dataset.cause)); return; }
  const ct = e.target.closest('[data-cat]');
  if (ct) { openCat(ct.dataset.cat); return; }
  const tp0 = e.target.closest('[data-node="top"]');
  if (tp0) { openTop(); return; }

  const ac = e.target.closest('[data-addcat]');
  if (ac) {
    const m = M_BY_KEY[ac.dataset.addcat];
    toast('検討対象に加えました',
      `「${m.label}」を原因の検討対象に加えました。${emptyHint(ac.dataset.addcat)}`, 'warn');
    return;
  }

  const tp = e.target.closest('[data-toproc]');
  if (tp) {
    const [treeId, idx] = tp.dataset.toproc.split('|');
    const c = TREE_BY_ID[treeId].causes[Number(idx)];
    toast('検討依頼を作成しました',
      `「${c.label}」を工程FMEAへ追加するかの検討を、生産技術部へ依頼しました。`);
    return;
  }

  const t = e.target.closest('[data-tr]');
  if (t) {
    const rec = TR_BY_ID[t.dataset.tr];
    if (!rec) return;
    openPanel('不具合記録：' + rec.id, `
      <dl class="meta-list">
        <dt>管理番号</dt><dd class="mono">${esc(rec.id)}</dd>
        <dt>発生日 ／ 製品 ／ 工程</dt><dd>${esc(rec.date)}　${esc(rec.prod)}　${esc(procLabel(rec.proc))}</dd>
        <dt>評価</dt><dd class="mono">S${rec.s}　O${rec.o}　D${rec.d}</dd>
      </dl>
      <div class="quote" style="margin-top:var(--space-4)">
        <p><strong>発生事象</strong><br>${esc(rec.sym)}</p>
        <p style="margin-top:var(--space-3)"><strong>原因</strong><br>${esc(rec.cause)}</p>
        <p style="margin-top:var(--space-3)"><strong>恒久対策</strong><br>${esc(rec.perm)}</p>
      </div>`);
  }
});

// キーボードでも枠を開けるようにする
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const n = e.target.closest && e.target.closest('.node');
  if (!n) return;
  e.preventDefault();
  if (n.dataset.cause !== undefined) openCause(Number(n.dataset.cause));
  else if (n.dataset.cat) openCat(n.dataset.cat);
  else if (n.dataset.node === 'top') openTop();
});
