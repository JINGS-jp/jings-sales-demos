#!/usr/bin/env python3
"""JINGS 営業標準デモ ビルダー

src/common/（共通CSS・共通JS・共通データ）と src/demos/<id>/（画面・ロジック）を
結合し、dist/ に外部依存のない単一HTMLを出力する。
ヘッダー・サイドナビ・根拠パネル・通知は本スクリプトが生成するため、
7本すべてで構造とUIが一致する。

使い方:
    python3 build.py            # 全デモ + トップページ
    python3 build.py 01         # 指定デモのみ
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
COMMON = SRC / "common"
DEMOS = SRC / "demos"
DIST = ROOT / "dist"

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


BRAND_ICON = ('<svg viewBox="0 0 24 24" width="22" height="22" fill="none" '
              'stroke="var(--color-primary)" stroke-width="2" aria-hidden="true">'
              '<rect x="3" y="3" width="18" height="18" rx="2"/>'
              '<path d="M3 9h18M9 9v12"/></svg>')


def build_demo(demo_dir: Path, css: str, shell_js: str, data_js: str) -> Path:
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

<header class="app-header">
  <button class="icon-btn" style="margin-left:0" id="navToggle" aria-label="メニューを開閉する" aria-expanded="false">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
  </button>
  <span class="app-header__brand">{BRAND_ICON}{meta["title"]}</span>
  <span class="app-header__context">{meta["context"]}</span>
  <span class="env-badge">デモ環境・架空データ</span>
  <span class="app-header__spacer"></span>
  <span class="app-header__user">山田（品質保証部）</span>
</header>

<nav class="app-sidebar" id="sidebar" aria-label="メインメニュー">
{nav}
  <a class="nav-back" href="index.html">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
    デモ一覧へ戻る
  </a>
</nav>

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
    cards = "\n".join(f"""
      <a class="demo-card" href="{m['id']}.html">
        <span class="demo-card__no">{i + 1}</span>
        <span class="demo-card__icon">{icon_svg(m.get('icon', 'doc'))}</span>
        <span class="demo-card__main">
          <span class="demo-card__title">{m['title']}</span>
          <span class="demo-card__desc">{m['pitch']}</span>
          <span class="demo-card__meta">想定業務：{m['context']}　／　所要 {m['minutes']}分</span>
        </span>
        <span class="demo-card__go">開く
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </span>
      </a>""" for i, m in enumerate(metas))

    html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>JINGS 営業デモ集</title>
<style>
{css}
.lp{{max-width:1080px;margin:0 auto;padding:var(--space-8) var(--space-5) var(--space-9)}}
.lp__head{{padding-bottom:var(--space-6);border-bottom:4px solid var(--color-primary);margin-bottom:var(--space-7)}}
.lp__brand{{display:flex;align-items:center;gap:var(--space-3);font-size:var(--font-section-title);font-weight:700}}
.lp__title{{margin-top:var(--space-4);font-size:var(--font-display);line-height:1.25}}
.lp__lead{{margin-top:var(--space-4);font-size:var(--font-body-large);color:var(--color-text-secondary);max-width:var(--reading-max-width)}}
.demo-list{{display:flex;flex-direction:column;gap:var(--space-4)}}
.demo-card{{display:flex;align-items:center;gap:var(--space-4);padding:var(--space-5);background:var(--color-background);border:1px solid var(--color-border-light);border-left:4px solid var(--color-primary);border-radius:var(--radius-medium);box-shadow:var(--shadow-low);text-decoration:none;color:inherit;transition:box-shadow .15s ease,transform .15s ease}}
.demo-card:hover{{box-shadow:var(--shadow-middle);transform:translateY(-2px)}}
.demo-card__no{{flex:none;width:32px;height:32px;display:grid;place-items:center;border-radius:var(--radius-pill);background:var(--color-primary);color:#fff;font-weight:700;font-size:var(--font-caption)}}
.demo-card__icon{{flex:none;width:44px;height:44px;display:grid;place-items:center;border-radius:var(--radius-medium);background:var(--color-primary-subtle);color:var(--color-primary)}}
.demo-card__icon svg{{width:24px;height:24px}}
.demo-card__main{{flex:1;min-width:0}}
.demo-card__title{{display:block;font-size:var(--font-subsection-title);font-weight:700}}
.demo-card__desc{{display:block;margin-top:var(--space-1);color:var(--color-text-secondary)}}
.demo-card__meta{{display:block;margin-top:var(--space-2);font-size:var(--font-caption);color:var(--color-text-tertiary)}}
.demo-card__go{{flex:none;display:inline-flex;align-items:center;gap:var(--space-1);color:var(--color-primary);font-weight:700;font-size:var(--font-caption)}}
.lp__note{{margin-top:var(--space-8);padding:var(--space-5);background:var(--color-warning-bg);border-radius:var(--radius-medium)}}
.lp__note h2{{font-size:var(--font-subsection-title);margin-bottom:var(--space-3)}}
.lp__note ul{{margin:0;padding-left:1.2em;line-height:var(--line-height-body)}}
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
    <p class="lp__brand">{BRAND_ICON}JINGS 営業デモ集</p>
    <h1 class="lp__title">製造業向けAIデモ 7本</h1>
    <p class="lp__lead">商談でそのまま見せられる動くデモです。7本すべて同じ架空企業「JINGSデモ精機」のデータでつながっているので、複数を続けて見せても話が破綻しません。使いたいデモをクリックしてください。</p>
  </header>

  <div class="demo-list">{cards}
  </div>

  <section class="lp__note">
    <h2>使うときの注意</h2>
    <ul>
      <li>データはすべて架空です。実顧客のデータは含まれていないため、どの見込み客にもそのまま見せられます。</li>
      <li>各デモの「根拠」ボタンを必ず押してください。AIが出典を示せることが商談で最も効く部分です。</li>
      <li>S・O・Dやリスク評価をAIが自動確定しない作りにしています。「最終判断は人」が製造業では必須の説明になります。</li>
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

    only = sys.argv[1] if len(sys.argv) > 1 else None
    dirs = sorted(d for d in DEMOS.iterdir() if d.is_dir() and (d / "meta.json").exists())
    metas = []
    for d in dirs:
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        metas.append(meta)
        if only and meta["id"] != only:
            continue
        out = build_demo(d, css, shell_js, data_js)
        print(f"  {out.relative_to(ROOT)}  {out.stat().st_size // 1024} KB")

    if not only:
        out = build_index(css, metas)
        print(f"  {out.relative_to(ROOT)}  {out.stat().st_size // 1024} KB")
    print(f"デモ {len(metas)} 本 / 出力先 {DIST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
