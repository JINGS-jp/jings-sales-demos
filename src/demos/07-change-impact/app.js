/* デモ7：変更影響・変化点管理
   設計変更を起点に、反映すべき帳票・工程・他機種を洗い出して反映状態を追跡する。
   要点は3つ。
   ・「未反映」と「確認できず」を区別する（文書が未登録で追えないものを反映済みにしない）
   ・関連変更（この変更に伴って見直すべき変更）を提示する
   ・段階（暫定／最終）を持たせる。暫定のまま止まっている変更が管理の穴になる */

const TR_BY_ID = {};
DATA.TROUBLES.forEach(t => TR_BY_ID[t.id] = t);
const PROC_BY_NO = {};
DATA.PROCESSES.forEach(p => PROC_BY_NO[p.no] = p);
const ECN_BY_NO = {};
DATA.ECNS.forEach(e => ECN_BY_NO[e.no] = e);
const DWG_BY_NO = {};
DATA.DRAWINGS.forEach(d => DWG_BY_NO[d.no] = d);
const procLabel = no => PROC_BY_NO[no] ? `工程${no} ${PROC_BY_NO[no].name}` : `工程${no}`;

const ST = {
  done: '<span class="status status--done">反映済み</span>',
  todo: '<span class="status status--risk">要対応</span>',
  pending: '<span class="status status--warn">確認待ち</span>',
  unknown: '<span class="status status--todo">確認できず</span>'
};
const ST_TEXT = { done: '反映済み', todo: '要対応', pending: '確認待ち', unknown: '確認できず' };

const reflectOf = no => DATA.CHANGE_REFLECT[no] || [];
const openCount = no => reflectOf(no).filter(r => r.status === 'todo').length;
const pendCount = no => reflectOf(no).filter(r => r.status === 'pending').length;
const unknownCount = no => reflectOf(no).filter(r => r.status === 'unknown').length;

/* 追跡する反映先の絞り込み */
function filteredReflect(no) {
  const useDoc = $('#trDoc').checked, useFmea = $('#trFmea').checked, useOther = $('#trOther').checked;
  return reflectOf(no).filter(r => {
    if (r.kind === '他機種展開') return useOther;
    if (r.kind === '工程FMEA' || r.kind === 'QC工程表') return useFmea;
    return useDoc;
  });
}

let curNo = '', curRows = [];

/* ---- 分析結果 ---- */
function renderImpact() {
  const e = ECN_BY_NO[curNo];
  const usePiggy = $('#trPiggy').checked;
  const open = curRows.filter(r => r.status === 'todo');
  const pend = curRows.filter(r => r.status === 'pending');
  const unk = curRows.filter(r => r.status === 'unknown');
  const done = curRows.filter(r => r.status === 'done');
  const tr = e.src ? TR_BY_ID[e.src] : null;
  const fmeaRows = DATA.PFMEA.filter(r => e.procs.includes(r.proc));
  const piggy = usePiggy ? (e.piggy || []).map(n => ECN_BY_NO[n]).filter(Boolean) : [];
  // この変更を関連変更元として挙げている変更（逆方向も見る）
  const piggyFrom = usePiggy ? DATA.ECNS.filter(x => (x.piggy || []).includes(curNo)) : [];

  const summary = `
    <div class="card" style="border-left:4px solid var(--color-primary)">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-3)">
        <span class="status status--done">分析完了</span>
        <span class="cell-sub mono">${esc(e.no)}</span>
        <span class="status status--${e.stage === '暫定' ? 'warn' : 'done'}">段階：${esc(e.stage)}</span>
        <span class="cell-sub">${esc(e.date)}　／　${esc(e.prod)}　／　${today()}</span>
      </div>
      <h2 style="font-size:var(--font-subsection-title);margin-bottom:var(--space-2)">${esc(e.title)}</h2>
      <p class="cell-sub" style="margin-bottom:var(--space-4)">発行理由：${esc(e.reason)}</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--space-4);margin-bottom:var(--space-4)">
        <div><p class="kpi__label">反映先</p><p class="kpi__value" style="font-size:var(--font-section-title)">${curRows.length}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">要対応</p><p class="kpi__value" style="font-size:var(--font-section-title)">${open.length}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">確認待ち</p><p class="kpi__value" style="font-size:var(--font-section-title)">${pend.length}<span class="kpi__unit"> 件</span></p><p class="kpi__note">人の確認が必要</p></div>
        <div><p class="kpi__label">確認できず</p><p class="kpi__value" style="font-size:var(--font-section-title)">${unk.length}<span class="kpi__unit"> 件</span></p><p class="kpi__note">文書が未登録</p></div>
        <div><p class="kpi__label">反映済み</p><p class="kpi__value" style="font-size:var(--font-section-title)">${done.length}<span class="kpi__unit"> 件</span></p></div>
      </div>
      <p style="line-height:var(--line-height-body)">
        ${esc(e.no)}の反映先を ${curRows.length} 件洗い出しました。
        ${open.length ? `<strong>要対応が ${open.length} 件</strong>あります。` : '要対応はありません。'}${pend.length ? `確認待ちが ${pend.length} 件あります。` : ''}
        ${unk.length ? `${unk.length} 件は文書が未登録のため反映状態を確認できていません。反映済みとしては扱っていません。` : ''}
        ${e.stage === '暫定' ? '<strong>この変更は段階が「暫定」です。</strong>最終化されるまで、反映先の変更が確定していない可能性があります。' : ''}
      </p>
    </div>

    <div class="section">
      <h2 class="section__title">反映すべき帳票と反映状態</h2>
      <p class="section__lead">「要対応」「確認待ち」「確認できず」を分けて表示しています。要対応は反映されていないことが確認できたもの、確認待ちは人の確認が要るもの、確認できずは文書が未登録で追えないものです。確認できずは、文書が取り込まれていないため追跡できない状態です。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">反映すべき帳票と反映状態</caption>
          <thead><tr>
            <th scope="col">反映状態</th><th scope="col">反映先</th><th scope="col">種別</th>
            <th scope="col">状況</th><th scope="col">操作</th>
          </tr></thead>
          <tbody>${curRows.map((r, i) => `
            <tr>
              <td class="nowrap">${ST[r.status]}</td>
              <td class="col-text"><strong>${esc(r.target)}</strong></td>
              <td class="nowrap">${esc(r.kind)}</td>
              <td class="col-text cell-sub">${esc(r.note)}</td>
              <td class="nowrap">${r.status === 'todo'
                ? `<button class="btn btn--quiet btn--small" data-task="${i}">反映タスク作成のイメージを見る</button>`
                : r.status === 'unknown'
                  ? `<button class="btn btn--quiet btn--small" data-need="${i}">文書登録依頼のイメージを見る</button>`
                  : '<span class="cell-empty">—</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${fmeaRows.length ? `
    <div class="section">
      <h2 class="section__title">影響する工程に登録済みの故障モード</h2>
      <p class="section__lead">この変更が及ぶ工程に、既に登録されている故障モードです。変更によって予防・検出の手段が成立しなくなる行がないかを確認します。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">影響する工程の故障モード</caption>
          <thead><tr>
            <th scope="col">工程</th><th scope="col">故障モード</th>
            <th scope="col">現行の予防</th><th scope="col">現行の検出</th>
            <th scope="col">S・O・D</th><th scope="col">根拠</th>
          </tr></thead>
          <tbody>${fmeaRows.map(r => `
            <tr>
              <td class="nowrap">工程${esc(r.proc)}<div class="cell-sub">${esc(PROC_BY_NO[r.proc].name)}</div></td>
              <td class="col-text">${esc(r.mode)}</td>
              <td class="col-text">${esc(r.prev)}</td>
              <td class="col-text">${esc(r.det)}</td>
              <td class="nowrap">
                <span class="sod-badge${r.s >= 8 ? ' sod-badge--hi' : ''}">S${r.s}</span>
                <span class="sod-badge">O${r.o}</span>
                <span class="sod-badge">D${r.d}</span>
              </td>
              <td class="nowrap"><button class="btn btn--quiet btn--small" data-fmea="${esc(r.proc)}|${esc(r.mode)}">根拠を確認する</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    ${(piggy.length || piggyFrom.length) ? `
    <div class="section">
      <h2 class="section__title">関連変更</h2>
      <p class="section__lead">この変更に伴って一緒に変えるべき変更、またはこの変更を前提としている変更です。片方だけ進めると整合が取れなくなります。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">関連変更</caption>
          <thead><tr>
            <th scope="col">関係</th><th scope="col">通知番号</th><th scope="col">段階</th>
            <th scope="col">内容</th><th scope="col">要対応</th><th scope="col">操作</th>
          </tr></thead>
          <tbody>
            ${piggy.map(x => `
            <tr>
              <td class="nowrap"><span class="libchip">この変更に伴う</span></td>
              <td class="mono nowrap">${esc(x.no)}</td>
              <td class="nowrap"><span class="status status--${x.stage === '暫定' ? 'warn' : 'done'}">${esc(x.stage)}</span></td>
              <td class="col-text">${esc(x.title)}<div class="cell-sub">${esc(x.reason)}</div></td>
              <td class="nowrap">${openCount(x.no) ? `<span class="status status--risk">${openCount(x.no)} 件</span>` : '<span class="cell-empty">—</span>'}</td>
              <td class="nowrap"><button class="btn btn--quiet btn--small" data-jump="${esc(x.no)}">この変更を分析する</button></td>
            </tr>`).join('')}
            ${piggyFrom.map(x => `
            <tr>
              <td class="nowrap"><span class="libchip">この変更が前提</span></td>
              <td class="mono nowrap">${esc(x.no)}</td>
              <td class="nowrap"><span class="status status--${x.stage === '暫定' ? 'warn' : 'done'}">${esc(x.stage)}</span></td>
              <td class="col-text">${esc(x.title)}<div class="cell-sub">${esc(x.reason)}</div></td>
              <td class="nowrap">${openCount(x.no) ? `<span class="status status--risk">${openCount(x.no)} 件</span>` : '<span class="cell-empty">—</span>'}</td>
              <td class="nowrap"><button class="btn btn--quiet btn--small" data-jump="${esc(x.no)}">この変更を分析する</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <div class="section">
      <h2 class="section__title">配布先</h2>
      <p class="section__lead">この変更を知らせるべき部署です。反映作業の担当と、変更を知っておく必要がある部署を分けて考えてください。</p>
      <div class="card">
        <div class="chip-row">${e.notify.map(n => `<span class="libchip">${esc(n)}</span>`).join('')}</div>
        ${tr ? `<p style="margin-top:var(--space-4)" class="cell-sub">この変更の発端となった不具合：<span class="mono">${esc(tr.id)}</span>（${esc(tr.date)}）${esc(tr.sym)}
          <button class="btn btn--quiet btn--small" data-tr="${esc(tr.id)}" style="margin-left:var(--space-2)">記録を確認する</button></p>` : ''}
      </div>
      <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);flex-wrap:wrap">
        <button class="btn btn--primary" id="btnImpCsv">影響範囲をExcelで出力する</button>
        <button class="btn btn--secondary" id="btnNotify">配布先へ変更連絡を作成する</button>
      </div>
    </div>

    <div class="callout callout--warn">
      <div>
        <p class="callout__title">この結果を使うときの注意</p>
        <p>反映状態は取り込んだ帳票の記載から判定しています。作業要領書と検査記録が未登録のため、その反映状態は「確認できず」としており、反映済みとして数えていません。反映率を数字にする場合は、この確認できずの件数を分母から除くか別掲するかを先に決めてください。関連変更は登録済みの関連付けに基づくもので、網羅を保証するものではありません。</p>
      </div>
    </div>`;

  $('#impResult').innerHTML = summary;
  $('#btnImpCsv').addEventListener('click', exportImpact);
  $('#btnNotify').addEventListener('click', () => {
    toast('変更連絡を作成しました', `${e.notify.length} 部署（${e.notify.join('、')}）宛に、未反映 ${open.length} 件を含む変更連絡の下書きを作成しました。`);
  });
}

function exportImpact() {
  const e = ECN_BY_NO[curNo];
  downloadXlsx(`変更影響_${curNo}_${today()}.xlsx`, [
    ['通知番号', '発行日', '段階', '内容', '発行理由', '対象品番', '配布先', '関連変更'],
    [e.no, e.date, e.stage, e.title, e.reason, e.prod, e.notify.join('・'), (e.piggy || []).join('・')],
    [],
    ['反映状態', '反映先', '種別', '状況'],
    ...curRows.map(r => [ST_TEXT[r.status], r.target, r.kind, r.note])
  ]);
  toast('影響範囲を出力しました', `反映先 ${curRows.length} 件を出力しました。未反映と確認できずを区別しています。`);
}

/* ---- 変更一覧 ---- */
function renderList() {
  const prov = DATA.ECNS.filter(e => e.stage === '暫定');
  const allR = Object.values(DATA.CHANGE_REFLECT).flat();
  const kpis = [
    { label: '設計変更通知', value: DATA.ECNS.length, unit: ' 件',
      note: `段階が暫定 ${prov.length} 件` },
    { label: '要対応の項目', value: allR.filter(r => r.status === 'todo').length, unit: ' 件', warn: true,
      note: '反映作業が必要' },
    { label: '確認できない項目', value: allR.filter(r => r.status === 'unknown').length, unit: ' 件',
      note: '文書が未登録で追跡できない' },
    { label: '関連変更の関連付け', value: DATA.ECNS.filter(e => (e.piggy || []).length).length, unit: ' 件',
      note: '一緒に変えるべき変更がある' }
  ];
  $('#kpiGrid').innerHTML = kpis.map(k => `
    <div class="card">
      <p class="kpi__label">${k.warn || k.risk ? `<span class="kpi__dot kpi__dot--${k.risk ? 'risk' : 'warn'}"></span>` : ''}${esc(k.label)}</p>
      <p class="kpi__value">${esc(k.value)}<span class="kpi__unit">${esc(k.unit)}</span></p>
      <p class="kpi__note">${esc(k.note)}</p>
    </div>`).join('');

  // 暫定を先、次に要対応の多い順
  const rows = DATA.ECNS.slice().sort((a, b) => {
    const sa = a.stage === '暫定' ? 0 : 1, sb = b.stage === '暫定' ? 0 : 1;
    return sa - sb || openCount(b.no) - openCount(a.no);
  });
  $('#listMeta').innerHTML =
    `全 ${DATA.ECNS.length} 件　／　段階が暫定のものを先頭に、要対応の多い順で表示`;
  $('#listBody').innerHTML = rows.map(e => `
    <tr>
      <td class="mono nowrap">${esc(e.no)}</td>
      <td class="mono nowrap">${esc(e.date)}</td>
      <td class="nowrap"><span class="status status--${e.stage === '暫定' ? 'warn' : 'done'}">${esc(e.stage)}</span></td>
      <td class="col-text">${esc(e.title)}</td>
      <td class="col-text cell-sub">${esc(e.reason)}</td>
      <td class="nowrap">
        ${openCount(e.no) ? `<span class="status status--risk">未反映 ${openCount(e.no)}</span>` : '<span class="status status--done">未反映なし</span>'}
        ${unknownCount(e.no) ? `<div style="margin-top:var(--space-1)"><span class="status status--todo">確認できず ${unknownCount(e.no)}</span></div>` : ''}
      </td>
      <td class="nowrap">${(e.piggy || []).length
        ? `<span class="mono cell-sub">${esc(e.piggy.join(', '))}</span>` : '<span class="cell-empty">—</span>'}</td>
      <td class="nowrap"><button class="btn btn--quiet btn--small" data-jump="${esc(e.no)}">影響を分析する</button></td>
    </tr>`).join('');
  return rows;
}

/* ---- 反映状況マトリクス ---- */
function renderMatrix() {
  const kinds = Array.from(new Set(Object.values(DATA.CHANGE_REFLECT).flat().map(r => r.kind)));
  $('#matHead').innerHTML = '<th scope="col">通知番号</th><th scope="col">段階</th>'
    + kinds.map(k => `<th scope="col">${esc(k)}</th>`).join('');
  $('#matBody').innerHTML = DATA.ECNS.map(e => {
    const rs = reflectOf(e.no);
    return `<tr>
      <td class="mono nowrap">${esc(e.no)}</td>
      <td class="nowrap"><span class="status status--${e.stage === '暫定' ? 'warn' : 'done'}">${esc(e.stage)}</span></td>
      ${kinds.map(k => {
        const hit = rs.filter(r => r.kind === k);
        if (!hit.length) return '<td class="cell-empty nowrap">—</td>';
        const worst = hit.some(h => h.status === 'todo') ? 'todo'
          : hit.some(h => h.status === 'pending') ? 'pending'
          : hit.some(h => h.status === 'unknown') ? 'unknown' : 'done';
        return `<td class="nowrap">${ST[worst]}${hit.length > 1 ? `<div class="cell-sub">${hit.length}件</div>` : ''}</td>`;
      }).join('')}
    </tr>`;
  }).join('');

  const all = Object.values(DATA.CHANGE_REFLECT).flat();
  const done = all.filter(r => r.status === 'done').length;
  const unk = all.filter(r => r.status === 'unknown').length;
  $('#matMeta').innerHTML =
    `反映先 全 ${all.length} 件　／　反映済み ${done} 件・要対応 ${all.filter(r => r.status === 'open').length} 件・確認できず ${unk} 件`;
  $('#matNote').textContent =
    `確認できずを分母に含めると反映率は ${Math.round(done / all.length * 100)}%、除くと ${Math.round(done / (all.length - unk) * 100)}% になります。`
    + `同じ実態で数字が変わるため、反映率を管理指標にする場合は、確認できずの扱いを先に決めておく必要があります。`
    + `作業要領書と検査記録を取り込めば、この差はなくなります。`;
}

/* ---- 参照文書 ---- */
function renderDocs() {
  const rows = [
    ['設計変更通知（ECN）', '変更管理帳票', `${DATA.ECNS.length} 件。段階・配布先・関連変更の関連付け`, 'done', '解析完了'],
    ['製品図面', '図面', `${DATA.DRAWINGS.length} 件。版と適用済みECNの対応`, 'done', '解析完了'],
    ['工程FMEA', '様式1', `${DATA.PFMEA_TOTAL.toLocaleString()} 行。工程単位の反映状態`, 'done', '解析完了'],
    ['QC工程表・条件表', '管理帳票', '工程ごとの管理項目と規格値', 'done', '解析完了'],
    ['原材料仕様書', '技術資料', '材質・銘柄の変更反映', 'warn', '一部のみ登録'],
    ['設計審査記録（DR）', '審査記録', `${DATA.DR_FINDINGS.length} 件の指摘との対応`, 'done', '解析完了'],
    ['作業要領書', '作業標準', '未登録のため反映状態を追跡できません', 'todo', '未登録'],
    ['検査記録（測定値）', '検査記録', '未登録のため反映状態を追跡できません', 'todo', '未登録']
  ];
  $('#docsBody').innerHTML = rows.map(r => `
    <tr>
      <td>${esc(r[0])}</td><td class="nowrap">${esc(r[1])}</td>
      <td class="col-text cell-sub">${esc(r[2])}</td>
      <td><span class="status status--${r[3]}">${esc(r[4])}</span></td>
    </tr>`).join('');
}

/* ---- 分析の実行 ---- */
function runImpact(no) {
  curNo = no;
  $('#ecnSelect').value = no;
  $('#ecnError').hidden = true;
  $('#ecnSelect').removeAttribute('aria-invalid');
  $('#impIdle').hidden = true;
  $('#impResult').hidden = true;
  $('#impLoading').hidden = false;
  const e = ECN_BY_NO[no];
  $('#impLoadMeta').textContent =
    `対象：${no}　${e.title}　／　影響工程 ${e.procs.length} 件・図面 ${e.drawings.length} 件・配布先 ${e.notify.length} 部署`;
  runSteps('#impStepper', () => {
    curRows = filteredReflect(no);
    $('#impLoading').hidden = true;
    renderImpact();
    $('#impResult').hidden = false;
  }, 300);
}

/* ---- 初期化 ---- */
wireShell();
renderList();
renderMatrix();
renderDocs();

// 段階が暫定のものを先頭に
DATA.ECNS.slice().sort((a, b) => (a.stage === '暫定' ? 0 : 1) - (b.stage === '暫定' ? 0 : 1))
  .forEach(e => {
    const o = document.createElement('option');
    o.value = e.no;
    o.textContent = `${e.no}　${e.stage}　${e.title.slice(0, 26)}`;
    $('#ecnSelect').appendChild(o);
  });

/* ===== 変更の帳票／文章から、どの変更かを探す ==============
   番号を知らなくても始められるようにする。
   帳票をアップロードするか、内容を文章で書くと、登録済みの変更から候補を出す。
   1件に絞れないときは決め打ちせず、候補を並べて人に選んでもらう。 */

function icNorm(s) { return (s || '').toLowerCase().replace(/[\s　・、。（）()「」\.,\/]/g, ''); }
function icGrams(s) {
  const n = icNorm(s), g = [];
  for (let i = 0; i < n.length - 1; i++) g.push(n.slice(i, i + 2));
  return g;
}
function icDice(a, b) {
  const A = icGrams(a), B = icGrams(b);
  if (!A.length || !B.length) return 0;
  const bag = {};
  B.forEach(g => bag[g] = (bag[g] || 0) + 1);
  let hit = 0;
  A.forEach(g => { if (bag[g] > 0) { bag[g]--; hit++; } });
  return 2 * hit / (A.length + B.length);
}

const ECN_TEXT_SAMPLE = 'ACT-230の減速ギヤについて、歯面幅を8.5に広げて材質もPPSに変える件。'
  + '試作の耐久試験で歯面が異常摩耗したので、その対策として出したもの。まだ暫定のまま。';

/* 帳票を読んだときに出す、読み取り結果の見本 */
const ECN_FILE_ROWS = [
  { k: '文書の種類', v: '変更発議書' },
  { k: '発行日', v: '2026-07-15' },
  { k: '対象機種', v: 'ACT-230' },
  { k: '読み取った内容', v: '減速ギヤの歯面幅拡大および材質変更' },
  { k: '発議理由', v: '試作耐久試験で歯面に異常摩耗' }
];

/* 文章と登録済みの変更を突き合わせて、近い順に返す */
function findEcn(text) {
  return DATA.ECNS.map(e => {
    const hay = [e.title, e.reason, e.prod || '', e.no].join(' ');
    return { e, score: Math.max(icDice(text, hay), icDice(text, e.title)) };
  }).sort((a, b) => b.score - a.score);
}

function pickEcn(e, score, how) {
  $('#ecnSelect').value = e.no;
  $('#ecnError').hidden = true;
  $('#ecnSelect').removeAttribute('aria-invalid');
  $('#ecnCands').hidden = false;
  $('#ecnCands').innerHTML = `
    <div class="callout callout--info" style="margin-top:var(--space-3)">
      <div>
        <p class="callout__title">この変更として扱います</p>
        <dl class="meta-list" style="margin-top:var(--space-2)">
          <dt>変更通知</dt><dd class="mono">${esc(e.no)}</dd>
          <dt>内容</dt><dd>${esc(e.title)}</dd>
          <dt>段階</dt><dd>${esc(e.stage)}${e.stage === '暫定' ? '（暫定のまま止まっています）' : ''}</dd>
          <dt>決め方</dt><dd>${esc(how)}${score != null ? `　文面の一致：${score >= 0.25 ? '高' : score >= 0.12 ? '中' : '低'}` : ''}</dd>
        </dl>
        <p style="margin-top:var(--space-3);font-size:var(--font-caption)">
          違っていれば、下の「対象の設計変更」で選び直してください。
        </p>
      </div>
    </div>`;
  toast('変更を特定しました', `${e.no}　${e.title}`);
}

/* 候補を並べて人に選んでもらう */
function askEcn(cands, lead) {
  openModal('どの変更のことですか', lead,
    cands.slice(0, 3).map((c, i) => ({
      label: `${c.e.no}　${c.e.title}`,
      desc: `${c.e.date}　${c.e.stage}　文面の一致：${c.score >= 0.25 ? '高' : c.score >= 0.12 ? '中' : '低'}`,
      onPick: () => pickEcn(c.e, c.score, '候補から人が選択')
    })));
}

function readEcnText(text) {
  const cands = findEcn(text);
  const [a, b] = cands;
  // 1位が弱い、または1位と2位が僅差のときは決め打ちしない
  if (a.score < 0.12) {
    askEcn(cands, '書かれた内容に近い変更を、登録済みのものから決められませんでした。'
      + '取り違えると、この先の反映状況がすべて別の変更のものになります。近いものを選んでください。');
    return;
  }
  if (b && a.score - b.score < 0.05) {
    askEcn(cands, '近い変更が複数あり、1件に絞れませんでした。どちらのことか選んでください。');
    return;
  }
  pickEcn(a.e, a.score, '文章から判定');
}

wireDrop({
  file: '#ecnFile', sample: '#btnEcnSample', readout: '#ecnReadout',
  sampleName: '変更発議書_ACT-230_20260715.xlsx', rows: ECN_FILE_ROWS,
  toast: '記載内容から、どの変更かを探します。',
  onRead: () => {
    // 帳票からは記載内容がそのまま取れるので、文章より確実に決まる
    readEcnText('ACT-230 減速ギヤ 歯面幅拡大 材質変更 試作耐久試験 歯面 異常摩耗');
  }
});

$('#btnEcnTextSample').addEventListener('click', () => {
  $('#ecnText').value = ECN_TEXT_SAMPLE;
  $('#ecnText').focus();
});
$('#btnEcnRead').addEventListener('click', () => {
  const t = $('#ecnText').value.trim();
  if (!t) {
    toast('文章が空です', '変更の内容を書いてから探してください。', 'error');
    $('#ecnText').focus();
    return;
  }
  readEcnText(t);
});

$('#impForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const no = $('#ecnSelect').value;
  if (!no) {
    $('#ecnError').hidden = false;
    $('#ecnSelect').setAttribute('aria-invalid', 'true');
    toast('対象の設計変更を選択してください', '変更を選ぶと影響範囲を分析できます。', 'error');
    return;
  }
  runImpact(no);
});

$('#btnListCsv').addEventListener('click', () => {
  const rows = renderList();
  downloadXlsx(`設計変更一覧_${today()}.xlsx`, [
    ['通知番号', '発行日', '段階', '内容', '発行理由', '対象品番', '状態',
     '要対応', '確認待ち', '確認できず', '関連変更', '配布先'],
    ...rows.map(e => [e.no, e.date, e.stage, e.title, e.reason, e.prod, e.status,
      openCount(e.no), unknownCount(e.no), (e.piggy || []).join('・'), e.notify.join('・')])
  ]);
  toast('Excelを出力しました', `${rows.length} 件の変更通知を出力しました。`);
});

$('#btnMatCsv').addEventListener('click', () => {
  const kinds = Array.from(new Set(Object.values(DATA.CHANGE_REFLECT).flat().map(r => r.kind)));
  downloadXlsx(`反映状況マトリクス_${today()}.xlsx`, [
    ['通知番号', '段階', ...kinds],
    ...DATA.ECNS.map(e => {
      const rs = reflectOf(e.no);
      return [e.no, e.stage, ...kinds.map(k => {
        const hit = rs.filter(r => r.kind === k);
        if (!hit.length) return '';
        const worst = hit.some(h => h.status === 'todo') ? 'todo'
          : hit.some(h => h.status === 'pending') ? 'pending'
          : hit.some(h => h.status === 'unknown') ? 'unknown' : 'done';
        return ST_TEXT[worst];
      })];
    })
  ]);
  toast('マトリクスを出力しました', `${DATA.ECNS.length} 件 × ${kinds.length} 種別を出力しました。`);
});

document.addEventListener('click', ev => {
  const j = ev.target.closest('[data-jump]');
  if (j) { showView('impact'); runImpact(j.dataset.jump); return; }

  const tk = ev.target.closest('[data-task]');
  if (tk) {
    const r = curRows[Number(tk.dataset.task)];
    toast('反映作業として起票しました', `${r.target}　担当と期限は仮置きです。反映後にこの画面の状態が変わります。`);
    return;
  }
  const nd = ev.target.closest('[data-need]');
  if (nd) {
    const r = curRows[Number(nd.dataset.need)];
    toast('文書の登録を依頼しました', `${r.target}　登録されると、反映状態を「確認できず」から判定できるようになります。`, 'warn');
    return;
  }

  const fm = ev.target.closest('[data-fmea]');
  if (fm) {
    const [proc, mode] = fm.dataset.fmea.split('|');
    const r = DATA.PFMEA.find(x => x.proc === proc && x.mode === mode);
    if (!r) return;
    const p = PROC_BY_NO[proc];
    openPanel('根拠：工程FMEA ' + procLabel(proc), `
      <dl class="meta-list">
        <dt>工程</dt><dd>${esc(procLabel(proc))}${p.mark ? `　／　特性記号 ${esc(p.mark)}` : ''}</dd>
        <dt>工程の機能</dt><dd>${esc(p.func)}</dd>
      </dl>
      <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">工程FMEAの記載</h3>
      <div class="quote">
        <p><strong>故障モード</strong><br>${esc(r.mode)}</p>
        <p style="margin-top:var(--space-3)"><strong>影響</strong><br>${esc(r.eff)}</p>
        <p style="margin-top:var(--space-3)"><strong>現行の予防 ／ 検出</strong><br>${esc(r.prev)} ／ ${esc(r.det)}</p>
        <p style="margin-top:var(--space-3)"><strong>評価</strong><br><span class="mono">S${r.s}　O${r.o}　D${r.d}　RPN ${r.s * r.o * r.d}</span></p>
      </div>
      ${sheetShot('pfmea', '工程FMEA ACT-220 Ver.09（様式1）',
        'この行は帳票の該当行に対応します。変更後にこの記載が成立するかを確認してください。')}`);
    return;
  }

  const t = ev.target.closest('[data-tr]');
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
