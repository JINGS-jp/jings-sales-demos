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
      ${esc(note || '本実装では、該当セルへ直接ジャンプできるようにします。')}
    </p>`;
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

/* ---- CSV出力（Excelで開ける BOM 付き） ---- */
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
      この判断は理由とともに記録され、以後のAI判定に反映されます。
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
