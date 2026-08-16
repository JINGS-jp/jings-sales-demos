/* JINGS 営業標準デモ 共通スクリプト */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ---- 画面切替 ---- */
function showView(name) {
  $$('.view').forEach(v => {
    const show = v.dataset.view === name;
    if (show && v.hidden) { v.style.animation = 'none'; void v.offsetHeight; v.style.animation = ''; }
    v.hidden = !show;
  });
  $$('.nav-item').forEach(b => {
    if (b.dataset.view === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (window.innerWidth <= 1024) setSidebar(false);
  window.scrollTo(0, 0);
}
function setSidebar(open) {
  const sb = $('#sidebar'), tg = $('#navToggle');
  if (!sb) return;
  sb.dataset.open = String(open);
  if (tg) tg.setAttribute('aria-expanded', String(open));
}

/* ---- 根拠パネル ---- */
let _lastFocus = null;
function openPanel(title, html) {
  const panel = $('#panel'), bd = $('#panelBackdrop');
  _lastFocus = document.activeElement;
  $('#panelTitle').textContent = title;
  $('#panelBody').innerHTML = html;
  if (panel.hidden) { panel.style.animation = 'none'; void panel.offsetHeight; panel.style.animation = ''; }
  panel.hidden = false; bd.hidden = false;
  $('#panelClose').focus();
}
function closePanel() {
  $('#panel').hidden = true;
  $('#panelBackdrop').hidden = true;
  if (_lastFocus) _lastFocus.focus();
}

/* ---- 帳票の実物スクショ（出典の裏取り） ----
   SHEET_IMG はビルド時に埋め込まれる {キー: dataURI}。
   AIの引用テキストの隣に実物を並べることで、出典が本物であることを見せる。 */
function sheetShot(key, caption, note) {
  const src = (typeof SHEET_IMG !== 'undefined') && SHEET_IMG[key];
  if (!src) return '';
  return `
    <h3 style="font-size:var(--font-body);margin:var(--space-5) 0 var(--space-2)">帳票の実物</h3>
    <figure style="margin:0">
      <button class="sheet-shot" type="button" data-zoom="${esc(key)}"
              aria-label="${esc(caption)}を拡大表示する">
        <img src="${src}" alt="${esc(caption)}">
      </button>
      <figcaption style="margin-top:var(--space-2);font-size:var(--font-caption);color:var(--color-text-secondary)">
        ${esc(caption)}　／　画像をクリックすると拡大します
      </figcaption>
    </figure>
    <p style="margin-top:var(--space-3);font-size:var(--font-caption);color:var(--color-text-secondary)">
      ${esc(note || '実際に入れるときは、押すと帳票の該当セルへ飛ぶようにします。')}
    </p>`;
}

/* 回答の本文に帳票の実物を並べる。
   根拠パネルを開かなくても「本当にこの紙から取っている」ことが伝わるようにする。 */
function sheetStrip(items, lead) {
  const use = items.filter(x => (typeof SHEET_IMG !== 'undefined') && SHEET_IMG[x.key]);
  if (!use.length) return '';
  return `
    <div class="section">
      <h2 class="section__title">引用元の帳票</h2>
      <p class="section__lead">${esc(lead)}</p>
      <div class="shot-strip">
        ${use.map(x => `
          <figure class="shot-strip__i">
            <button class="sheet-shot" type="button" data-zoom="${esc(x.key)}"
                    aria-label="${esc(x.cap)}を拡大して見る">
              <img src="${SHEET_IMG[x.key]}" alt="${esc(x.cap)}">
            </button>
            <figcaption>${esc(x.cap)}</figcaption>
          </figure>`).join('')}
      </div>
    </div>`;
}

/* 拡大表示（画面いっぱいで帳票を読む） */
function wireSheetZoom() {
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-zoom]');
    if (!b) return;
    const src = SHEET_IMG[b.dataset.zoom];
    if (!src) return;
    const bd = document.createElement('div');
    bd.className = 'shot-zoom';
    bd.innerHTML = `<img src="${src}" alt="帳票の拡大表示">
      <button class="btn btn--quiet shot-zoom__close" type="button">閉じる</button>`;
    bd.addEventListener('click', () => bd.remove());
    document.body.appendChild(bd);
  });
}

/* ---- 通知 ---- */
function toast(title, body, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' toast--' + kind : '');
  el.setAttribute('role', 'status');
  el.innerHTML = `<div><p class="toast__title">${esc(title)}</p>${body ? `<p class="toast__body">${esc(body)}</p>` : ''}</div>`;
  $('#toastArea').appendChild(el);
  setTimeout(() => el.remove(), 5200);
}

/* ---- 段階表示ローダー（AIの処理内容を利用者の言葉で出す） ---- */
function runSteps(stepperSel, doneFn, perStep) {
  const steps = $$(stepperSel + ' .step');
  steps.forEach(s => s.dataset.state = 'todo');
  let i = 0;
  const tick = () => {
    if (i > 0) {
      steps[i - 1].dataset.state = 'done';
      steps[i - 1].querySelector('.step__mark').textContent = '✓';
    }
    if (i >= steps.length) { doneFn(); return; }
    steps[i].dataset.state = 'active';
    i++;
    setTimeout(tick, perStep || 320);
  };
  tick();
}

/* ---- CSV出力（BOM付き。いまはExcel出力を使うので予備） ---- */
function downloadCsv(filename, rows) {
  const body = rows.map(r => r.map(c => {
    const v = String(c == null ? '' : c);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

/* ---- 共通の配線 ---- */
function wireShell() {
  $$('.nav-item').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-goto]');
    if (!t) return;
    e.preventDefault();
    showView(t.dataset.goto);
  });
  const tg = $('#navToggle');
  if (tg) tg.addEventListener('click', () => setSidebar($('#sidebar').dataset.open !== 'true'));
  wireSheetZoom();
  $('#panelClose').addEventListener('click', closePanel);
  $('#panelBackdrop').addEventListener('click', closePanel);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#panel').hidden) closePanel();
  });
}

/* ---- ファイル起点（1ファイル渡せば動くことを見せる） ----
   プルダウンだけだと「うちのデータを全部入れないと使えないのか」と受け取られる。
   1ファイルから始められることを、アップロードの動作で示す。
   opt: { file, sample, readout, target, onRead } */
function wireDrop(opt) {
  const nameEl = $(opt.file + 'Name');
  const show = name => {
    if (nameEl) nameEl.textContent = name;
    $(opt.readout).hidden = false;
    $(opt.readout).innerHTML = `
      <div class="callout callout--info">
        <div>
          <p class="callout__title">ファイルを読み取りました</p>
          <dl class="meta-list" style="margin-top:var(--space-2)">
            <dt>ファイル</dt><dd class="mono">${esc(name)}</dd>
            ${opt.rows.map(r => `<dt>${esc(r.k)}</dt><dd>${r.v}</dd>`).join('')}
          </dl>
          <p style="margin-top:var(--space-3);font-size:var(--font-caption);color:var(--color-text-secondary)">
            ここではサンプルを表示しています。実際に入れるときは、アップロードしたファイルの中身をそのまま読みます。
          </p>
        </div>
      </div>`;
    if (opt.onRead) opt.onRead(name);
    toast('ファイルを読み取りました', opt.toast || '内容を読み取りました。このまま実行できます。');
  };
  $(opt.file).addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) show(f.name);
  });
  $(opt.sample).addEventListener('click', () => show(opt.sampleName));
}

/* ---- Excel出力 ------------------------------------------
   「Excelで出力」と書いてある以上、本物の .xlsx を出す。
   外部ライブラリは読み込まない方針なので、zip（無圧縮）を自前で組み立てる。
   xlsx の実体は zip なので、必要な XML を数枚入れれば Excel が開ける。 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const enc = new TextEncoder();

/* 無圧縮zipを組み立てる。files は {name, data:Uint8Array} の配列。 */
function zipStore(files) {
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  const chunks = [], central = [];
  let offset = 0;

  const u16 = v => [v & 0xFF, (v >>> 8) & 0xFF];
  const u32 = v => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];

  files.forEach(f => {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const head = [0x50, 0x4B, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(f.data.length), ...u32(f.data.length),
      ...u16(nameBytes.length), ...u16(0)];
    chunks.push(new Uint8Array(head), nameBytes, f.data);
    central.push([[0x50, 0x4B, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(f.data.length), ...u32(f.data.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)],
      nameBytes]);
    offset += head.length + nameBytes.length + f.data.length;
  });

  const cdParts = [];
  let cdLen = 0;
  central.forEach(([arr, nameBytes]) => {
    cdParts.push(new Uint8Array(arr), nameBytes);
    cdLen += arr.length + nameBytes.length;
  });
  const eocd = new Uint8Array([0x50, 0x4B, 0x05, 0x06, ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length), ...u32(cdLen), ...u32(offset), ...u16(0)]);

  const all = [...chunks, ...cdParts, eocd];
  const total = all.reduce((a, x) => a + x.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  all.forEach(x => { out.set(x, p); p += x.length; });
  return out;
}

function xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\x00-\x08\x0B\x0C\x0E-\x1F/g, '');
}

/* 表をExcelブックにして保存する。1行目は見出しとして固定＆太字にする。 */
function downloadXlsx(filename, rows, sheetName) {
  const name = (sheetName || 'Sheet1').slice(0, 28);
  const colCount = Math.max(...rows.map(r => r.length));
  // 列幅は中身の長さから決める（全角を2文字ぶんで数える）
  const width = i => {
    const w = Math.max(...rows.map(r => {
      const v = String(r[i] == null ? '' : r[i]);
      return v.replace(/[^\x01-\x7E]/g, '..').length;
    }));
    return Math.min(60, Math.max(9, w + 2));
  };
  const cols = '<cols>' + Array.from({ length: colCount }, (_, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${width(i)}" customWidth="1"/>`).join('') + '</cols>';

  const colName = n => {
    let s = '';
    n += 1;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  };
  const sheetRows = rows.map((r, ri) => {
    const cells = r.map((v, ci) => {
      const ref = colName(ci) + (ri + 1);
      const st = ri === 0 ? ' s="1"' : '';
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
      const t = xmlEsc(v);
      if (t === '') return `<c r="${ref}"${st}/>`;
      return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${t}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');

  const F = (n, s) => ({ name: n, data: enc.encode(s) });
  const files = [
    F('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>'),
    F('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>'),
    F('xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
      + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets><sheet name="${xmlEsc(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    F('xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>'),
    F('xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font>'
      + '<font><b/><sz val="11"/><name val="Yu Gothic"/></font></fonts>'
      + '<fills count="3"><fill><patternFill patternType="none"/></fill>'
      + '<fill><patternFill patternType="gray125"/></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF0F4"/><bgColor indexed="64"/></patternFill></fill></fills>'
      + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
      + '<border><left style="thin"><color rgb="FFC8CCD4"/></left><right style="thin"><color rgb="FFC8CCD4"/></right>'
      + '<top style="thin"><color rgb="FFC8CCD4"/></top><bottom style="thin"><color rgb="FFC8CCD4"/></bottom><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
      + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">'
      + '<alignment vertical="center" wrapText="1"/></xf></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
    F('xl/worksheets/sheet1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + '<sheetFormatPr defaultRowHeight="18"/>'
      + cols + '<sheetData>' + sheetRows + '</sheetData></worksheet>')
  ];

  const blob = new Blob([zipStore(files)],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---- 確認モーダル（生成を止めて人に判断を仰ぐ） ----
   曖昧な判断をAIが勝手に決めないことを画面で示すための仕組み。
   背景クリックでは閉じない（選ぶまで進めない）。 */
function openModal(title, lead, options) {
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  const m = document.createElement('div');
  m.className = 'modal';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.innerHTML = `
    <h2 class="modal__title">${esc(title)}</h2>
    <p class="modal__lead">${lead}</p>
    <div class="modal__opts">
      ${options.map((o, i) => `
        <button class="modal__opt" type="button" data-opt="${i}">
          <strong>${esc(o.label)}${o.rec ? '<span class="modal__rec">推奨</span>' : ''}</strong>
          <span>${esc(o.desc)}</span>
        </button>`).join('')}
    </div>
    <p style="margin-top:var(--space-5);font-size:var(--font-caption);color:var(--color-text-secondary)">
      選んだ理由も一緒に記録されます。次から同じ判断を繰り返さずに済みます。
    </p>`;
  document.body.appendChild(bd);
  document.body.appendChild(m);
  m.querySelector('.modal__opt').focus();
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-opt]');
    if (!b) return;
    const opt = options[Number(b.dataset.opt)];
    m.remove(); bd.remove();
    opt.onPick();
  });
}

/* ---- 段階ローダー（途中で止められる版） ----
   pauseAt に指定した段でコールバックを呼び、resume() が呼ばれるまで進めない。 */
function runStepsPausable(stepperSel, doneFn, perStep, pauseAt, onPause) {
  const steps = $$(stepperSel + ' .step');
  steps.forEach(s => s.dataset.state = 'todo');
  let i = 0;
  const advance = () => {
    if (i > 0) {
      steps[i - 1].dataset.state = 'done';
      steps[i - 1].querySelector('.step__mark').textContent = '✓';
    }
    if (i >= steps.length) { doneFn(); return; }
    steps[i].dataset.state = 'active';
    i++;
    if (pauseAt != null && i === pauseAt) { onPause(() => setTimeout(advance, 120)); return; }
    setTimeout(advance, perStep || 320);
  };
  advance();
}

/* ---- インライン編集を有効にする ----
   セルを編集すると行の状態を「担当者修正済み」に変える。 */
function wireEditable(rootSel, onEdit) {
  const root = $(rootSel);
  if (!root) return;
  root.addEventListener('input', e => {
    const cell = e.target.closest('.editcell');
    if (!cell) return;
    const tr = cell.closest('tr');
    if (tr) tr.dataset.edited = 'true';
    if (onEdit) onEdit(cell, tr);
  });
}

/* ---- 日付表示 ---- */
function today() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
