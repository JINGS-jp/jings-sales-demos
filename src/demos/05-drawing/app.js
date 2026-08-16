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

/* ---- 図面（JIS製図の体裁で描く） ------------------------
   図面枠・表題欄・第三角法の正面図と断面図・寸法線・中心線・幾何公差まで入れる。
   AIが確認候補とした箇所には、赤い丸囲みと番号を重ねる。
   実際の運用ではCADのPDFに同じ印を重ねることになる。 */

/* 寸法線を1本引く（両端の矢印、寸法補助線、寸法値） */
function dimH(x1, x2, y, txt, off) {
  const o = off || 0;
  const m = (x1 + x2) / 2;
  return `
    <line class="dim" x1="${x1}" y1="${y - o - 4}" x2="${x1}" y2="${y + 4}"/>
    <line class="dim" x1="${x2}" y1="${y - o - 4}" x2="${x2}" y2="${y + 4}"/>
    <line class="dim" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" marker-start="url(#ar)" marker-end="url(#ar)"/>
    <text class="dimtxt" x="${m}" y="${y - 5}" text-anchor="middle">${esc(txt)}</text>`;
}
function dimV(y1, y2, x, txt) {
  const m = (y1 + y2) / 2;
  return `
    <line class="dim" x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}"/>
    <line class="dim" x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}"/>
    <line class="dim" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" marker-start="url(#ar)" marker-end="url(#ar)"/>
    <text class="dimtxt" x="${x + 5}" y="${m + 4}">${esc(txt)}</text>`;
}
/* 引き出し線つきの注記（φ寸法や公差の指示） */
function leader(x, y, tx, ty, txt) {
  const anchor = tx < x ? 'end' : 'start';
  const ex = tx < x ? tx - 4 : tx + 4;
  return `
    <path class="dim" d="M${x} ${y} L${tx} ${ty} H${ex}" marker-start="url(#ar)"/>
    <text class="dimtxt" x="${ex + (anchor === 'end' ? -3 : 3)}" y="${ty - 4}" text-anchor="${anchor}">${esc(txt)}</text>`;
}
/* 幾何公差の枠（記号｜値｜データム） */
function gtol(x, y, sym, val, dat) {
  return `
    <g>
      <rect class="tb" x="${x}" y="${y}" width="22" height="18"/>
      <rect class="tb" x="${x + 22}" y="${y}" width="52" height="18"/>
      <rect class="tb" x="${x + 74}" y="${y}" width="20" height="18"/>
      <text class="dimtxt" x="${x + 11}" y="${y + 13}" text-anchor="middle">${esc(sym)}</text>
      <text class="dimtxt" x="${x + 48}" y="${y + 13}" text-anchor="middle">${esc(val)}</text>
      <text class="dimtxt" x="${x + 84}" y="${y + 13}" text-anchor="middle">${esc(dat)}</text>
    </g>`;
}

/* 部品ごとの形。図面番号の末尾3桁で選ぶ。 */
function partGeom(no) {
  const t = no.slice(-3);
  if (t === '200') return 'gear';
  if (t === '400') return 'pcb';
  if (t === '500') return 'harness';
  if (t === '100') return 'housing';
  return 'case';
}

function bodyFront(kind, hits) {
  // 正面図の中身。cx,cy を中心にして描く。
  const cx = 250, cy = 215;
  if (kind === 'gear') {
    const teeth = 24;
    const tp = Array.from({ length: teeth }, (_, i) => {
      const a = i * 2 * Math.PI / teeth, w = Math.PI / teeth * 0.42;
      const r1 = 96, r2 = 108;
      const p = (r, ang) => `${(cx + r * Math.cos(ang)).toFixed(1)} ${(cy + r * Math.sin(ang)).toFixed(1)}`;
      return `M${p(r1, a - w)} L${p(r2, a - w * 0.62)} L${p(r2, a + w * 0.62)} L${p(r1, a + w)}`;
    }).join(' ');
    return `
      <circle class="outline" cx="${cx}" cy="${cy}" r="96"/>
      <path class="inner" d="${tp}"/>
      <circle class="inner" cx="${cx}" cy="${cy}" r="62"/>
      <circle class="inner" cx="${cx}" cy="${cy}" r="26"/>
      <path class="inner" d="M${cx - 5} ${cy - 26} v-7 h10 v7"/>
      <circle class="ctr" cx="${cx}" cy="${cy}" r="102" fill="none"/>
      <line class="ctr" x1="${cx - 120}" y1="${cy}" x2="${cx + 120}" y2="${cy}"/>
      <line class="ctr" x1="${cx}" y1="${cy - 120}" x2="${cx}" y2="${cy + 120}"/>`;
  }
  if (kind === 'pcb') {
    const pads = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++)
      pads.push(`<rect class="inner" x="${cx - 108 + c * 28}" y="${cy - 62 + r * 26}" width="15" height="9"/>`);
    return `
      <rect class="outline" x="${cx - 128}" y="${cy - 82}" width="256" height="164" rx="4"/>
      ${pads.join('')}
      ${[[-108, -66], [108, -66], [-108, 66], [108, 66]].map(([dx, dy]) =>
        `<circle class="inner" cx="${cx + dx}" cy="${cy + dy}" r="6"/>`).join('')}
      <line class="ctr" x1="${cx - 150}" y1="${cy}" x2="${cx + 150}" y2="${cy}"/>
      <line class="ctr" x1="${cx}" y1="${cy - 104}" x2="${cx}" y2="${cy + 104}"/>`;
  }
  if (kind === 'harness') {
    return `
      <path class="outline" d="M${cx - 130} ${cy - 40} h44 v-16 h34 v16 h${130 + 130 - 44 - 34 - 130} "/>
      <path class="outline" d="M${cx - 130} ${cy - 40} v80 h44 v16 h34 v-16 h96 a34 34 0 0 0 34 -34 v-46 z"/>
      <rect class="inner" x="${cx - 122}" y="${cy - 30}" width="26" height="60" rx="3"/>
      <rect class="inner" x="${cx + 60}" y="${cy - 26}" width="52" height="52" rx="3"/>
      ${[0, 1, 2, 3].map(i => `<circle class="inner" cx="${cx + 72 + (i % 2) * 26}" cy="${cy - 12 + Math.floor(i / 2) * 24}" r="7"/>`).join('')}
      <line class="ctr" x1="${cx - 150}" y1="${cy}" x2="${cx + 150}" y2="${cy}"/>`;
  }
  if (kind === 'housing') {
    return `
      <path class="outline" d="M${cx - 120} ${cy - 78} h240 v120 a34 34 0 0 1 -34 34 h-172 a34 34 0 0 1 -34 -34 z"/>
      <circle class="inner" cx="${cx}" cy="${cy}" r="46"/>
      <circle class="inner" cx="${cx}" cy="${cy}" r="32"/>
      <path class="hid" d="M${cx - 62} ${cy - 78} v154 M${cx + 62} ${cy - 78} v154"/>
      ${[[-92, -52], [92, -52], [-92, 52], [92, 52]].map(([dx, dy]) =>
        `<circle class="inner" cx="${cx + dx}" cy="${cy + dy}" r="8"/>`).join('')}
      <line class="ctr" x1="${cx - 145}" y1="${cy}" x2="${cx + 145}" y2="${cy}"/>
      <line class="ctr" x1="${cx}" y1="${cy - 104}" x2="${cx}" y2="${cy + 104}"/>`;
  }
  // ケース：部品表はM3×6本だが、図中の締結指示は4箇所しかない。
  // この食い違いが検図の指摘（R-06）そのものなので、図面にもそのまま描く。
  const bolts = [[-96, -60], [96, -60], [-96, 60], [96, 60]];
  return `
    <rect class="outline" x="${cx - 124}" y="${cy - 84}" width="248" height="168" rx="8"/>
    <rect class="inner" x="${cx - 108}" y="${cy - 68}" width="216" height="136" rx="5"/>
    <path class="hid" d="M${cx - 114} ${cy - 74} h228 v148 h-228 z"/>
    <circle class="inner" cx="${cx}" cy="${cy}" r="40"/>
    ${bolts.map(([dx, dy]) => `
      <circle class="inner" cx="${cx + dx}" cy="${cy + dy}" r="7"/>
      <line class="ctr" x1="${cx + dx - 12}" y1="${cy + dy}" x2="${cx + dx + 12}" y2="${cy + dy}"/>
      <line class="ctr" x1="${cx + dx}" y1="${cy + dy - 12}" x2="${cx + dx}" y2="${cy + dy + 12}"/>`).join('')}
    <line class="ctr" x1="${cx - 148}" y1="${cy}" x2="${cx + 148}" y2="${cy}"/>
    <line class="ctr" x1="${cx}" y1="${cy - 108}" x2="${cx}" y2="${cy + 108}"/>`;
}

/* 断面図 A-A。肉厚とシール溝が見えるようにする。 */
function bodySection(kind) {
  const x = 620, y = 215;
  if (kind === 'gear') return `
    <path class="hatch" d="M${x - 30} ${y - 96} h60 v40 h-16 v112 h16 v40 h-60 v-40 h16 v-112 h-16 z"/>
    <line class="ctr" x1="${x}" y1="${y - 120}" x2="${x}" y2="${y + 120}"/>
    ${dimH(x - 30, x + 30, y + 128, '8.5', 26)}`;
  if (kind === 'pcb') return `
    <path class="hatch" d="M${x - 84} ${y - 8} h168 v16 h-168 z"/>
    ${[0, 1, 2, 3, 4].map(i => `<rect class="inner" x="${x - 66 + i * 30}" y="${y - 22}" width="18" height="14"/>`).join('')}
    <line class="ctr" x1="${x - 100}" y1="${y}" x2="${x + 100}" y2="${y}"/>
    ${dimV(y - 8, y + 8, x + 96, '1.6')}`;
  if (kind === 'harness') return `
    <circle class="hatch" cx="${x}" cy="${y}" r="34"/>
    <circle class="inner" cx="${x}" cy="${y}" r="20" fill="#fff"/>
    ${[0, 1, 2, 3, 4, 5].map(i => {
      const a = i * Math.PI / 3;
      return `<circle class="inner" cx="${(x + 27 * Math.cos(a)).toFixed(1)}" cy="${(y + 27 * Math.sin(a)).toFixed(1)}" r="5"/>`;
    }).join('')}
    <line class="ctr" x1="${x - 60}" y1="${y}" x2="${x + 60}" y2="${y}"/>
    <line class="ctr" x1="${x}" y1="${y - 60}" x2="${x}" y2="${y + 60}"/>`;
  if (kind === 'housing') return `
    <path class="hatch" d="M${x - 60} ${y - 78} h120 v154 h-120 z M${x - 42} ${y - 60} v118 h84 v-118 z" fill-rule="evenodd"/>
    <line class="ctr" x1="${x}" y1="${y - 104}" x2="${x}" y2="${y + 104}"/>
    ${dimH(x - 60, x - 42, y + 96, '9.0', 18)}`;
  // ケース：合わせ面とシール溝
  return `
    <path class="hatch" d="M${x - 62} ${y - 84} h124 v168 h-124 z M${x - 46} ${y - 68} v136 h92 v-136 z" fill-rule="evenodd"/>
    <rect class="outline" x="${x - 56}" y="${y - 84}" width="14" height="9" fill="#fff"/>
    <rect class="outline" x="${x + 42}" y="${y - 84}" width="14" height="9" fill="#fff"/>
    <line class="ctr" x1="${x}" y1="${y - 110}" x2="${x}" y2="${y + 110}"/>
    ${dimH(x - 62, x - 46, y + 100, '8.0', 16)}`;
}

/* 部品表。ケース図のみ。員数と図中の指示が合っていないことを、図面上で見えるようにする。 */
function partsList() {
  const x = 550, y = 372, w = 320;
  const rows = [
    ['1', 'ケース', 'PPS（GF40）', '1'],
    ['2', 'ガスケット', 'NBR', '1'],
    ['3', 'M3×8 六角穴付ボルト', 'SUS304', '6']
  ];
  const cw = [30, 150, 100, 40];
  const line = (i) => {
    let cx0 = x;
    return rows[i].map((v, c) => {
      const cell = `<rect class="tb" x="${cx0}" y="${y + 18 + i * 18}" width="${cw[c]}" height="18"/>`
        + `<text class="dimtxt" x="${cx0 + (c === 3 ? cw[c] / 2 : 4)}" y="${y + 31 + i * 18}"`
        + `${c === 3 ? ' text-anchor="middle"' : ''}>${esc(v)}</text>`;
      cx0 += cw[c];
      return cell;
    }).join('');
  };
  let hx = x;
  const head = ['番号', '部品名', '材質', '員数'].map((h, c) => {
    const cell = `<rect class="tb" x="${hx}" y="${y}" width="${cw[c]}" height="18"/>`
      + `<text class="tb-lbl" font-size="9" x="${hx + (c === 3 ? cw[c] / 2 : 4)}" y="${y + 12}"`
      + `${c === 3 ? ' text-anchor="middle"' : ''}>${esc(h)}</text>`;
    hx += cw[c];
    return cell;
  }).join('');
  return `<g>${head}${rows.map((_, i) => line(i)).join('')}</g>`;
}

/* 表題欄 */
function titleBlock(d, kind) {
  const x = 550, y = 468, w = 320, h = 116;
  const cell = (dx, dy, cw, ch, lbl, val, mono) => `
    <rect class="tb" x="${x + dx}" y="${y + dy}" width="${cw}" height="${ch}"/>
    <text class="tb-lbl" font-size="8.5" x="${x + dx + 5}" y="${y + dy + 11}">${esc(lbl)}</text>
    <text class="tb-val" x="${x + dx + 5}" y="${y + dy + ch - 6}" ${mono ? '' : 'style="font-family:sans-serif"'}>${esc(val)}</text>`;
  const MAT = { gear: 'POM（GF25）', pcb: 'FR-4 t1.6', harness: 'PVC / AVSS 0.5sq', housing: 'ADC12', case: 'PPS（GF40）' };
  return `
    <g>
      ${cell(0, 0, 200, 30, '品名', d.name, 0)}
      ${cell(200, 0, 120, 30, '図番', d.no, 1)}
      ${cell(0, 30, 100, 26, '材質', MAT[kind] || 'PPS（GF40）', 0)}
      ${cell(100, 30, 50, 26, '尺度', '1:2', 1)}
      ${cell(150, 30, 50, 26, '単位', 'mm', 1)}
      ${cell(200, 30, 60, 26, '版', d.rev, 1)}
      ${cell(260, 30, 60, 26, '投影法', '第三角', 0)}
      ${cell(0, 56, 100, 30, '設計', '技術部 森', 0)}
      ${cell(100, 56, 100, 30, '製図', '技術部 岩瀬', 0)}
      ${cell(200, 56, 120, 30, '承認', '大野（開発部長）', 0)}
      ${cell(0, 86, 200, 30, '会社名', 'JINGSデモ精機株式会社（架空）', 0)}
      ${cell(200, 86, 120, 30, '発行日', d.date, 1)}
    </g>`;
}

function drawSvg(no, hits) {
  const d = DWG_BY_NO[no] || { no, name: '', rev: '', date: '' };
  const kind = partGeom(no);
  const cx = 250, cy = 215;

  // 確認候補の位置と、番号を置く場所。
  // 並びは 印のx／印のy／印の半径／番号のx／番号のy。
  // 番号は部位のすぐ外に置いて、引き出し線が図を横切らないようにする。
  const SPOT = {
    case: [[cx, cy, 46, cx + 152, cy + 34], [cx - 96, cy - 60, 14, cx - 150, cy - 96],
           [cx + 96, cy - 60, 14, cx + 150, cy - 96], [cx - 96, cy + 60, 14, cx - 150, cy + 96],
           [cx + 96, cy + 60, 14, cx + 150, cy + 96]],
    housing: [[cx, cy, 52, cx + 172, cy + 40], [cx - 92, cy - 52, 14, cx - 152, cy - 88],
              [cx + 92, cy - 52, 14, cx + 152, cy - 88], [cx - 92, cy + 52, 14, cx - 152, cy + 88],
              [cx + 92, cy + 52, 14, cx + 152, cy + 88]],
    gear: [[cx + 74, cy - 74, 22, cx + 152, cy - 118], [cx, cy, 30, cx + 152, cy + 40],
           [cx, cy, 34, cx + 152, cy + 40], [cx - 70, cy + 70, 20, cx - 146, cy + 112],
           [cx + 96, cy, 18, cx + 152, cy - 22]],
    pcb: [[cx - 108, cy - 66, 13, cx - 160, cy - 104], [cx + 108, cy - 66, 13, cx + 160, cy - 104],
          [cx, cy, 40, cx + 152, cy + 30], [cx - 108, cy + 66, 13, cx - 160, cy + 104],
          [cx + 108, cy + 66, 13, cx + 160, cy + 104]],
    harness: [[cx + 86, cy, 34, cx + 152, cy - 52], [cx - 109, cy, 24, cx - 152, cy - 44],
              [cx, cy - 40, 18, cx, cy - 96], [cx + 60, cy + 30, 18, cx + 140, cy + 88],
              [cx - 60, cy + 40, 18, cx - 140, cy + 88]]
  }[kind];

  const marks = hits.slice(0, 5).map((h, i) => {
    const [mx, my, r, bx, by] = SPOT[i % SPOT.length];
    // 印から番号までを最短で結ぶ（円の縁から出す）
    const dx = bx - mx, dy = by - my, len = Math.hypot(dx, dy) || 1;
    const sx = mx + dx / len * r, sy = my + dy / len * r;
    const ex = bx - dx / len * 11, ey = by - dy / len * 11;
    return `
      <circle class="hitfill" cx="${mx}" cy="${my}" r="${r}"/>
      <circle class="hit" cx="${mx}" cy="${my}" r="${r}"/>
      <line class="lead" x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"/>
      <circle class="balloon" cx="${bx}" cy="${by}" r="11"/>
      <text class="balloon-t" x="${bx}" y="${by + 4}" text-anchor="middle">${i + 1}</text>`;
  }).join('');

  const DIMS = {
    case: dimH(cx - 124, cx + 124, 348, '124.0', 84) + dimV(cy - 84, cy + 84, 408, '84.0')
      + leader(cx + 96, cy - 60, cx + 150, cy - 142, 'M3 深さ6　4箇所')
      + leader(cx - 40, cy + 34, cx - 60, cy + 152, 'シール溝 1.5±0.05')
      + gtol(60, 396, '⏥', '0.05', 'A'),
    housing: dimH(cx - 120, cx + 120, 348, '120.0', 84) + dimV(cy - 78, cy + 76, 408, '78.0')
      + leader(cx + 32, cy - 32, cx + 150, cy - 142, 'φ12.0 +0.02/0')
      + leader(cx - 62, cy + 40, cx - 60, cy + 152, 'φ8 通し 4箇所')
      + gtol(60, 396, '⌭', 'φ0.03', 'A'),
    gear: dimH(cx - 108, cx + 108, 348, 'φ108（歯先）', 84) + dimV(cy - 96, cy + 96, 408, 'φ96（基準）')
      + leader(cx + 20, cy - 18, cx + 150, cy - 142, '軸穴 φ11.0 +0.02/0')
      + leader(cx - 44, cy + 44, cx - 60, cy + 152, 'モジュール 1.0　歯数 24')
      + gtol(60, 396, '◎', '0.02', 'B'),
    pcb: dimH(cx - 128, cx + 128, 348, '128.0', 84) + dimV(cy - 82, cy + 82, 408, '82.0')
      + leader(cx - 60, cy - 40, cx - 60, cy - 142, 'φ3.2 取付穴 4箇所')
      + leader(cx + 40, cy + 40, cx + 150, cy + 152, '実装点数 148')
      + gtol(60, 396, '⏥', '0.10', 'A'),
    harness: dimH(cx - 130, cx + 112, 348, '242.0', 84) + dimV(cy - 56, cy + 56, 408, '56.0')
      + leader(cx + 86, cy + 20, cx + 150, cy + 152, '嵌合力 40〜80N')
      + leader(cx - 109, cy - 20, cx - 60, cy - 142, 'コネクタ 6極')
  }[kind];

  return `
    <svg class="dwg" viewBox="0 0 900 620" font-size="11" role="img"
         aria-label="${esc(no)} ${esc(d.name)} の図面。AIが確認候補とした箇所に番号を付けています">
      <defs>
        <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <path d="M0 1 L10 5 L0 9 z" fill="#1a1a1a"/>
        </marker>
        <pattern id="hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="7" stroke="#1a1a1a" stroke-width=".8"/>
        </pattern>
      </defs>

      <rect x="8" y="8" width="884" height="604" fill="#fff"/>
      <rect class="frame" x="18" y="18" width="864" height="584"/>
      <rect class="tb" x="26" y="26" width="848" height="568"/>

      <text class="vw" font-size="12" x="196" y="72">正面図</text>
      <text class="vw" font-size="12" x="576" y="72">A−A 断面</text>

      ${bodyFront(kind, hits)}
      ${bodySection(kind)}
      ${DIMS || ''}

      <line class="ctr" x1="${cx}" y1="76" x2="${cx}" y2="94"/>
      <text class="dimtxt" x="${cx + 6}" y="88">A</text>
      <text class="dimtxt" x="${cx + 6}" y="378">A</text>
      <line class="ctr" x1="${cx}" y1="366" x2="${cx}" y2="384"/>

      <text class="note" font-size="10" x="60" y="440">注記</text>
      <text class="note" font-size="10" x="60" y="456">1. 指示なき角部は C0.3</text>
      <text class="note" font-size="10" x="60" y="470">2. 指示なき寸法公差は JIS B 0405-m による</text>
      <text class="note" font-size="10" x="60" y="484">3. バリ・カエリなきこと</text>
      <text class="note" font-size="10" x="60" y="498">4. 表面粗さ 指示なき箇所 Ra6.3</text>

      ${kind === 'case' ? partsList() : ''}
      ${titleBlock(d, kind)}
      ${marks}

      ${hits.length ? `
        <rect x="700" y="30" width="172" height="22" fill="${'var(--color-error-bg)'}" stroke="var(--color-error)" stroke-width="1"/>
        <text class="dimtxt" x="786" y="45" text-anchor="middle" fill="var(--color-error)">確認候補 ${hits.length} 箇所（赤丸）</text>`
      : `<text class="dimtxt" x="786" y="45" text-anchor="middle">確認候補なし</text>`}
    </svg>`;
}

/* ---- 検図 ---- */
let curNo = '', curHits = [];

/* 重要度は検図ルールが持つ。指摘側では持たせない（二重管理にすると必ずずれる）。 */
function sevOf(h) {
  const r = RULE_BY_ID[h.rule];
  return r ? r.sev : '中';
}

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
  const heavy = curHits.filter(h => sevOf(h) === '重');

  if (!curHits.length) {
    $('#ckResult').innerHTML = `
      <div class="card" style="border-left:4px solid var(--color-success)">
        <span class="status status--done">確認完了</span>
        <h2 style="font-size:var(--font-subsection-title);margin:var(--space-3) 0 var(--space-2)">検図ルールに対する不足は見つかりませんでした</h2>
        <p>${esc(curNo)}（${esc(d.name)}）について、${DATA.DWG_RULES.length} 件の検図ルールと過去不具合の対策内容を確認しましたが、確認候補はありませんでした。</p>
        <p style="margin-top:var(--space-3);font-size:var(--font-caption)">
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
        <div><p class="kpi__label">重要度「重要」</p><p class="kpi__value" style="font-size:var(--font-section-title)">${heavy.length}<span class="kpi__unit"> 件</span></p></div>
        <div><p class="kpi__label">照合したルール</p><p class="kpi__value" style="font-size:var(--font-section-title)">${DATA.DWG_RULES.length}<span class="kpi__unit"> 件</span></p></div>
      </div>
      <p style="line-height:var(--line-height-body)">
        ${esc(curNo)}について、社内の検図ルール ${DATA.DWG_RULES.length} 件と過去不具合の対策内容を照合しました。
        ${prev ? `前機種の対応図面は ${esc(prev.no)}（${esc(prev.rev)}版）です。` : ''}
        ${heavy.length ? `重要度が「重要」の候補が ${heavy.length} 件あります。出図前に確認してください。` : ''}
      </p>
      <div style="margin-top:var(--space-4)">${drawSvg(curNo, curHits)}</div>
      <p style="margin-top:var(--space-2);font-size:var(--font-caption)">
        図はデモ用に描いた架空の部品図です。赤丸がAIの確認候補で、番号は下の一覧と対応しています。実際の運用では、CADから出したPDF図面に同じ印を重ねます。
      </p>
    </div>

    <div class="section">
      <h2 class="section__title">確認候補</h2>
      <p class="section__lead">どの検図ルールに対して足りないのかを書いています。直すかどうかは設計が決めてください。</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">検図の確認候補</caption>
          <thead><tr>
            <th scope="col">重要度</th><th scope="col">該当箇所</th><th scope="col">確認候補</th>
            <th scope="col">検図ルール</th><th scope="col">根拠</th>
          </tr></thead>
          <tbody>${curHits.map((h, i) => `
            <tr>
              <td class="nowrap">${SEV_LABEL[sevOf(h)]}</td>
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
    downloadXlsx(`検図結果_${curNo}_${today()}.xlsx`, [
      ['図面番号', '版', '重要度', '該当箇所', '確認候補', '理由', '検図ルール番号', 'ルール内容', '根拠となる過去記録'],
      ...curHits.map(h => [curNo, d.rev, sevOf(h), h.where, h.found, h.why, h.rule,
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
      <dt>重要度</dt><dd>${esc(sevOf(h))}（検図ルール ${esc(h.rule)} で定義）</dd>
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
      <p style="margin-top:var(--space-3);font-size:var(--font-caption)">
        この対策が今回の図面に反映されているかを確認しています。
      </p>` : `
      <p style="margin-top:var(--space-4);font-size:var(--font-caption)">
        この確認候補に対応する過去不具合はありません。検図ルールに対する不足としてのみ検出しています。
      </p>`}
    ${curNo === 'ACT-230-300' ? sheetShot('drawing',
       '図面属性表 ACT-230-300（図面から読み取った寸法・公差・注記・部品表）',
       '照合に使っているのは、図面から読み取ったこの中身です。実際に入れるときは、CADデータかPDF図面から同じ項目を抜いて、該当箇所に印を付けます。') : ''}
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

wireDrop({
  file: '#dwgFile', sample: '#btnDwgSample', readout: '#dwgReadout',
  sampleName: '図面属性表_ACT-230-300_RevA.xlsx',
  rows: [
    { k: '図面番号', v: '<span class="mono">ACT-230-300</span>　ケース（新設計）Rev.A' },
    { k: '読み取った寸法', v: '6 件（うち公差の指定なし 1 件）' },
    { k: '読み取った注記', v: '5 件' },
    { k: '読み取った部品表', v: '3 行（員数と図中指示の不一致 1 件）' }
  ],
  toast: '図面から寸法・公差・注記・部品表を読み取りました。検図を開始できます。',
  onRead: () => { $('#dwgSelect').value = 'ACT-230-300'; }
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
