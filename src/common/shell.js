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
  $('#panelClose').addEventListener('click', closePanel);
  $('#panelBackdrop').addEventListener('click', closePanel);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#panel').hidden) closePanel();
  });
}

/* ---- 日付表示 ---- */
function today() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
