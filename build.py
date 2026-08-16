#!/usr/bin/env python3
"""JINGS 営業標準デモ ビルダー

src/common/（共通CSS・共通JS・共通データ）と src/demos/<id>/（画面・ロジック）を
結合し、docs/ に外部依存のない単一HTMLを出力する。
ヘッダー・サイドナビ・根拠パネル・通知は本スクリプトが生成するため、
7本すべてで構造とUIが一致する。

使い方:
    python3 build.py            # 全デモ + トップページ
    python3 build.py 01         # 指定デモのみ
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
COMMON = SRC / "common"
DEMOS = SRC / "demos"
DIST = ROOT / "docs"

# --- アイコン（インラインSVG・線幅統一のアウトライン。絵文字は使わない） ---
ICONS = {
    "dashboard": '<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>',
    "search":    '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.5-4.5"/>',
    "doc":       '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    "flow":      '<rect x="3" y="3" width="6" height="5" rx="1"/><rect x="15" y="3" width="6" height="5" rx="1"/><rect x="9" y="16" width="6" height="5" rx="1"/><path d="M6 8v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8M12 13v3"/>',
    "scale":     '<path d="M12 3v18M5 7l7-4 7 4M3 13l2-6 2 6a3 3 0 0 1-4 0zM17 13l2-6 2 6a3 3 0 0 1-4 0z"/>',
    "folder":    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    "drawing":   '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 9v11M12 13h5M12 16h3"/>',
    "report":    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 12h8M8 16h8"/>',
    "change":    '<path d="M4 4v6h6M20 20v-6h-6"/><path d="M20 9a8 8 0 0 0-14.3-3M4 15a8 8 0 0 0 14.3 3"/>',
    "gate":      '<path d="M3 21V7l9-4 9 4v14"/><path d="M9 21v-6h6v6M3 11h18"/>',
    "check":     '<path d="M4 12l5 5L20 6"/>',
    "alert":     '<path d="M12 3l9 16H3z"/><path d="M12 9v5M12 17h.01"/>',
}


def icon_svg(name: str, cls: str = "") -> str:
    body = ICONS.get(name, ICONS["doc"])
    c = f' class="{cls}"' if cls else ""
    return (f'<svg{c} viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
            f'aria-hidden="true">{body}</svg>')


LOGO_URI = (COMMON / "assets" / "logo.txt").read_text(encoding="utf-8").strip()
BRAND_ICON = f'<img class="logo" src="{LOGO_URI}" alt="JINGS">' 


META_ICONS = {
    "dept": '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5"/>',
    "biz":  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 14h8"/>',
    "data": '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
}


def meta_icon(name: str) -> str:
    return ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" aria-hidden="true">{META_ICONS[name]}</svg>')


def load_sheet_imgs() -> dict:
    """sheets/snap.py が作った帳票画像のdata URI。無ければ空で進む（ビルドは止めない）。"""
    f = ROOT / "sheets" / "sheets.json"
    if not f.exists():
        print("  （帳票画像なし: python3 sheets/snap.py で生成できます）")
        return {}
    return json.loads(f.read_text(encoding="utf-8"))


def build_demo(demo_dir: Path, css: str, shell_js: str, data_js: str,
               sheet_imgs: dict) -> Path:
    meta = json.loads((demo_dir / "meta.json").read_text(encoding="utf-8"))
    body = (demo_dir / "body.html").read_text(encoding="utf-8")
    app = (demo_dir / "app.js").read_text(encoding="utf-8")

    nav = "\n".join(
        f'  <button class="nav-item" data-view="{n["view"]}"'
        f'{" aria-current=\"page\"" if i == 0 else ""}>'
        f'{icon_svg(n.get("icon", "doc"))}\n    {n["label"]}\n  </button>'
        for i, n in enumerate(meta["nav"])
    )

    scope = "\n<!-- scope:design-fmea-approved -->" if meta.get("designScope") else ""

    # このデモで使う帳票画像だけを埋め込む
    want = meta.get("sheets", [])
    imgs = {k: sheet_imgs[k] for k in want if k in sheet_imgs}
    missing = [k for k in want if k not in sheet_imgs]
    if missing:
        print(f"    警告: 帳票画像が見つかりません: {missing}")
    # check_demo.py の長大行スキップに合わせ1行で出す
    sheet_js = "const SHEET_IMG = " + json.dumps(imgs, ensure_ascii=False) + ";"

    # ヘッダー右のメタ。context は「部署 ／ 業務」で書いてある。
    parts = [x.strip() for x in meta["context"].split("／")]
    dept_label = parts[0]
    biz_label = parts[1] if len(parts) > 1 else meta.get("role", "—")

    html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{meta["title"]}｜JINGS デモ</title>{scope}
<style>
{css}
</style>
</head>
<body>

<nav class="app-sidebar" id="sidebar" aria-label="メインメニュー">
  <a class="sb-brand" href="index.html" aria-label="デモ一覧へ戻る">{BRAND_ICON}</a>
  <div class="sb-user">
    <span class="sb-user__ava" aria-hidden="true">山</span>
    <span class="sb-user__name">山田 太一<em>品質保証部</em></span>
  </div>
  <div class="sb-nav">
{nav}
  </div>
  <div class="nav-note">
    <p class="nav-note__role">{meta.get("role", meta["pitch"])}</p>
    <p class="nav-note__time">通しで見ると 約{meta["minutes"]}分</p>
  </div>
  <div class="sb-foot">
    <span class="env-badge">デモ環境・架空データ</span>
    <a class="nav-back" href="index.html">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
      デモ一覧へ戻る
    </a>
  </div>
</nav>

<header class="app-header">
  <button class="nav-toggle" id="navToggle" aria-label="メニューを開閉する" aria-expanded="false">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
  </button>
  <div class="app-header__main">
    <h1 class="app-header__title">{meta["title"]}</h1>
    <p class="app-header__crumb"><a href="index.html">JINGS 営業デモ</a><span aria-hidden="true">›</span>{meta["title"]}</p>
  </div>
  <dl class="hmeta">
    <div><dt>{meta_icon("dept")}想定部署</dt><dd>{dept_label}</dd></div>
    <div><dt>{meta_icon("biz")}想定業務</dt><dd>{biz_label}</dd></div>
    <div><dt>{meta_icon("data")}対象データ</dt><dd>JINGSデモ精機（架空）</dd></div>
  </dl>
</header>

<main class="app-main" id="main">
{body}
</main>

<div class="panel-backdrop" id="panelBackdrop" hidden></div>
<aside class="panel" id="panel" role="dialog" aria-modal="true" aria-labelledby="panelTitle" hidden>
  <div class="panel__head">
    <h2 class="panel__title" id="panelTitle">根拠資料</h2>
    <button class="icon-btn" id="panelClose" aria-label="パネルを閉じる">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  </div>
  <div class="panel__body" id="panelBody"></div>
</aside>

<div class="toast-area" id="toastArea" aria-live="polite"></div>

<script>
{sheet_js}
{data_js}
{shell_js}
(function(){{
{app}
}})();
</script>
</body>
</html>
"""
    out = DIST / f"{meta['id']}.html"
    out.write_text(html, encoding="utf-8")
    return out


def build_index(css: str, metas: list) -> Path:
    """トップページ。部署から引ける形にする。
    営業が最初に決めるのは「今日の相手は誰か」なので、そこから入れるようにする。"""
    DEPTS = [
        ("品証", "品質保証部の方へ", "不具合が起きたあとの調査・原因の掘り下げ・顧客への報告"),
        ("生技", "生産技術部の方へ", "工程FMEAの作成と改訂、設計変更の工程への反映"),
        ("設計", "設計部・技術部の方へ", "設計変更時のリスク検討、出図前の検図、設計審査"),
    ]

    def card(m, i=None):
        no = f'<span class="demo-card__no">{i}</span>' if i is not None else ""
        role = (f'<span class="demo-card__role">{m["role"]}</span>'
                if m.get("role") else "")
        also = (f'<span class="demo-card__also">{m["alsoFor"]}</span>'
                if m.get("alsoFor") else "")
        return f"""
      <a class="demo-card" href="{m['id']}.html">
        {no}
        <span class="demo-card__icon">{icon_svg(m.get('icon', 'doc'))}</span>
        <span class="demo-card__main">
          <span class="demo-card__title">{m['title']}</span>
          {role}
          <span class="demo-card__desc">{m['pitch']}</span>
          {also}
          <span class="demo-card__meta">想定業務：{m['context']}　／　所要 {m['minutes']}分</span>
        </span>
        <span class="demo-card__go">開く
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </span>
      </a>"""

    groups = ""
    for key, title, lead in DEPTS:
        mine = sorted([m for m in metas if m.get("dept") == key],
                      key=lambda x: x.get("order", 99))
        if not mine:
            continue
        groups += f"""
    <section class="dept">
      <h2 class="dept__title">{title}</h2>
      <p class="dept__lead">{lead}</p>
      <p class="dept__order">見せる順：{' → '.join(m['title'] for m in mine)}
        <span class="dept__time">（合計 {sum(m['minutes'] for m in mine)}分）</span></p>
      <div class="demo-list">{''.join(card(m, i + 1) for i, m in enumerate(mine))}
      </div>
    </section>"""

    all_cards = "".join(card(m) for m in sorted(metas, key=lambda x: x["id"]))

    html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>JINGS 営業デモ集</title>
<style>
{css}
.lp{{max-width:1080px;margin:0 auto;padding:var(--space-8) var(--space-5) var(--space-9)}}
.lp{{}}
.lp__head{{padding:var(--space-6);margin-bottom:var(--space-7);background:var(--color-background);border:1px solid var(--color-border-light);border-radius:var(--radius-large)}}
.lp__brand{{display:flex;align-items:center}}
.lp__brand .logo{{height:30px}}
.lp__title{{margin-top:var(--space-4);font-size:var(--font-page-title);line-height:1.3}}
.lp__lead{{margin-top:var(--space-3);font-size:var(--font-body);color:var(--color-text-secondary);max-width:var(--reading-max-width);line-height:var(--line-height-body)}}
.dept{{margin-bottom:var(--space-9)}}
.dept__title{{display:flex;align-items:center;gap:var(--space-3);font-size:var(--font-subsection-title);margin-bottom:var(--space-2)}}
.dept__lead{{font-size:var(--font-caption);color:var(--color-text-secondary);margin-bottom:var(--space-3)}}
.dept__order{{padding:var(--space-3) var(--space-4);margin-bottom:var(--space-4);background:var(--color-primary-subtle);border-radius:var(--radius-medium);font-size:var(--font-caption);font-weight:700;line-height:var(--line-height-body);color:var(--color-primary)}}
.dept__time{{font-weight:400;color:var(--color-text-secondary)}}
.demo-list{{display:flex;flex-direction:column;gap:var(--space-3)}}
.demo-card{{display:flex;align-items:center;gap:var(--space-4);padding:var(--space-4) var(--space-5);background:var(--color-background);border:1px solid var(--color-border-light);border-radius:var(--radius-medium);text-decoration:none;color:inherit;transition:border-color .15s ease,box-shadow .15s ease}}
.demo-card:hover{{border-color:var(--color-primary);box-shadow:var(--shadow-low)}}
.demo-card__no{{flex:none;width:32px;height:32px;display:grid;place-items:center;border-radius:var(--radius-pill);background:var(--color-primary);color:#fff;font-weight:700;font-size:var(--font-caption)}}
.demo-card__icon{{flex:none;width:40px;height:40px;display:grid;place-items:center;border-radius:var(--radius-medium);background:var(--color-primary-subtle);color:var(--color-primary)}}
.demo-card__icon svg{{width:24px;height:24px}}
.demo-card__main{{flex:1;min-width:0}}
.demo-card__title{{display:block;font-size:var(--font-body-large);font-weight:700}}
.demo-card__role{{display:block;margin-top:var(--space-1);font-size:var(--font-caption);font-weight:700;color:var(--color-primary)}}
.demo-card__desc{{display:block;margin-top:var(--space-1);font-size:var(--font-caption);color:var(--color-text-secondary);line-height:var(--line-height-body)}}
.demo-card__meta{{display:block;margin-top:var(--space-2);font-size:var(--font-caption);color:var(--color-text-tertiary)}}
.demo-card__also{{display:inline-block;margin-top:var(--space-2);padding:2px var(--space-2);border-radius:var(--radius-small);background:var(--color-background-muted);font-size:var(--font-caption);color:var(--color-text-secondary)}}
.demo-card__go{{flex:none;display:inline-flex;align-items:center;gap:var(--space-1);color:var(--color-primary);font-weight:700;font-size:var(--font-caption)}}
.lp__all{{margin-top:var(--space-8)}}
.lp__all summary{{cursor:pointer;font-size:var(--font-body);font-weight:700;padding:var(--space-3) var(--space-4);background:var(--color-background);border:1px solid var(--color-border-light);border-radius:var(--radius-medium)}}
.lp__note{{margin-top:var(--space-8);padding:var(--space-5);background:var(--color-warning-bg);border-radius:var(--radius-large)}}
.lp__note h2{{font-size:var(--font-body-large);margin-bottom:var(--space-3)}}
.lp__note ul{{margin:0;padding-left:1.2em;font-size:var(--font-caption);line-height:var(--line-height-body)}}
.lp__foot{{margin-top:var(--space-7);font-size:var(--font-caption);color:var(--color-text-tertiary)}}
@media (max-width:768px){{
  .demo-card{{flex-wrap:wrap}}
  .demo-card__go{{margin-left:auto}}
  .lp__title{{font-size:var(--font-page-title)}}
}}
</style>
</head>
<body>
<main class="lp">
  <header class="lp__head">
    <p class="lp__brand">{BRAND_ICON}</p>
    <h1 class="lp__title">製造業向けAIデモ</h1>
  </header>

{groups}

  <details class="lp__all">
    <summary>すべてのデモを一覧で見る</summary>
    <div class="demo-list" style="margin-top:var(--space-4)">{all_cards}
    </div>
  </details>

  <section class="lp__note">
    <h2>使うときの注意</h2>
    <ul>
      <li>データはすべて架空です。実顧客のデータは含まれていないため、どの見込み客にもそのまま見せられます。</li>
      <li>各デモの「根拠」ボタンを必ず押してください。AIが出典を示せることが商談で最も効く部分です。出典には帳票の実物が出ます。</li>
      <li>S・O・Dやリスク評価をAIが自動確定しない作りにしています。「最終判断は人」が製造業では必須の説明になります。</li>
      <li>帳票の実ファイルは <span class="mono">帳票サンプル</span> フォルダに入っています。Excelで開いて見せるのが最も効きます。</li>
      <li>顧客固有のデータを使ったデモが必要な場合は三上さんへご相談ください。</li>
    </ul>
  </section>

  <p class="lp__foot">株式会社JINGS 社内限り／架空データによるデモ環境</p>
</main>
</body>
</html>
"""
    out = DIST / "index.html"
    out.write_text(html, encoding="utf-8")
    return out


def main() -> int:
    DIST.mkdir(exist_ok=True)
    css = (COMMON / "style.css").read_text(encoding="utf-8")
    shell_js = (COMMON / "shell.js").read_text(encoding="utf-8")
    data_js = (COMMON / "data.js").read_text(encoding="utf-8")

    sheet_imgs = load_sheet_imgs()
    only = sys.argv[1] if len(sys.argv) > 1 else None
    dirs = sorted(d for d in DEMOS.iterdir() if d.is_dir() and (d / "meta.json").exists())
    metas = []
    for d in dirs:
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        metas.append(meta)
        if only and meta["id"] != only:
            continue
        out = build_demo(d, css, shell_js, data_js, sheet_imgs)
        print(f"  {out.relative_to(ROOT)}  {out.stat().st_size // 1024} KB")

    src_sheets = ROOT / "sheets" / "out"
    if src_sheets.exists():
        dst = DIST / "帳票サンプル"
        dst.mkdir(exist_ok=True)
        for f in src_sheets.glob("*.xlsx"):
            shutil.copy2(f, dst / f.name)
        print(f"  帳票サンプル {len(list(dst.glob('*.xlsx')))} 件を docs/帳票サンプル/ に配置")

    if not only:
        out = build_index(css, metas)
        print(f"  {out.relative_to(ROOT)}  {out.stat().st_size // 1024} KB")
    print(f"デモ {len(metas)} 本 / 出力先 {DIST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
