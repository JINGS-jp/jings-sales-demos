#!/usr/bin/env python3
"""JINGS 営業標準デモ Playwright検証

dist/ の各デモをブラウザで開き、主要導線が動作すること・JSエラーが出ないことを確認する。
デモごとの検証手順は CHECKS に定義する。

使い方:
    python3 verify.py            # 全デモ
    python3 verify.py 01-knowledge
"""
import asyncio
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

DIST = Path(__file__).resolve().parent / "dist"


def flat(s: str) -> str:
    """inner_text は要素境界で改行を挟むため、空白を潰して比較する。"""
    return re.sub(r"\s+", "", s)


async def check_index(pg, errors):
    await pg.goto((DIST / "index.html").as_uri())
    txt = await pg.inner_text(".lp")
    assert "JINGS 営業デモ集" in txt, "トップの見出しがない"
    cards = await pg.eval_on_selector_all(".demo-card", "els => els.map(e => e.getAttribute('href'))")
    assert cards, "デモカードが1件もない"
    for href in cards:
        assert (DIST / href).exists(), f"リンク先が存在しない: {href}"
    return f"トップページ：カード {len(cards)} 件・リンク先すべて存在"


async def check_01(pg, errors):
    await pg.goto((DIST / "01-knowledge.html").as_uri())
    # ダッシュボード
    kpi = await pg.inner_text("#kpiGrid")
    assert "2,847" in kpi and "412" in kpi, f"KPIが出ていない: {kpi[:120]}"
    assert await pg.inner_text("#openBody"), "要対応の表が空"
    assert await pg.query_selector("#procDist .dist__bar"), "工程別分布が描画されていない"
    # 不具合記録の根拠パネル
    await pg.click("#openBody [data-tr]")
    assert await pg.is_visible("#panel"), "根拠パネルが開かない"
    p = await pg.inner_text("#panelBody")
    assert "記録原文" in p and "恒久対策" in p, "根拠パネルの中身が不足"
    await pg.click("#panelClose")
    # 検索：未入力エラー
    await pg.click('[data-view="search"]')
    await pg.click("#qForm button[type=submit]")
    assert await pg.is_visible("#toastArea .toast"), "未入力時のエラー通知が出ない"
    # 検索：例文チップ→検索
    await pg.click("#qChips .chip")
    q = await pg.input_value("#q")
    assert q, "チップから事象が入らない"
    await pg.click("#qForm button[type=submit]")
    await pg.wait_for_selector("#qResult:not([hidden])", timeout=10000)
    r = await pg.inner_text("#qResult")
    assert "確認結果" in r, "結論が出ていない"
    assert "類似する不具合記録" in r, "類似記録の表が出ていない"
    assert "工程FMEAに登録済みの故障モード" in r, "工程FMEAとの照合が出ていない"
    assert "今回確認すべき項目" in r, "確認項目が出ていない"
    assert "%" in r, "関連度が出ていない"
    # 検索結果からFMEAの根拠
    await pg.click("#qResult [data-fm]")
    p2 = await pg.inner_text("#panelBody")
    assert "工程FMEAの記載" in p2 and "RPN" in p2, "FMEA根拠パネルの中身が不足"
    await pg.click("#panelClose")
    # 一致なしの空状態
    await pg.fill("#q", "該当しない語句をあえて入力して空状態を確認する")
    await pg.click("#qForm button[type=submit]")
    await pg.wait_for_selector("#qResult:not([hidden])", timeout=10000)
    r2 = await pg.inner_text("#qResult")
    assert "見つかりませんでした" in r2 and "追加で試せること" in r2, "空状態に次の手が示されていない"
    # 一覧の絞り込みとCSV
    await pg.click('[data-view="list"]')
    before = await pg.inner_text("#listMeta")
    await pg.select_option("#fStat", "対応中")
    after = await pg.inner_text("#listMeta")
    assert before != after and "絞り込み中" in after, "絞り込みが反映されない"
    async with pg.expect_download() as dl:
        await pg.click("#btnListCsv")
    d = await dl.value
    head = open(await d.path(), encoding="utf-8-sig").readline()
    assert "管理番号" in head and "恒久対策" in head, f"CSVヘッダが不正: {head[:80]}"
    # 文書
    await pg.click('[data-view="docs"]')
    docs = await pg.inner_text("#docsBody")
    assert "未登録" in docs, "未登録文書が明示されていない"
    return "デモ1：ダッシュボード・検索（結論/類似/FMEA照合/確認項目）・空状態・絞り込み・CSV・根拠パネル"


async def check_02(pg, errors):
    await pg.goto((DIST / "02-process-fmea.html").as_uri())
    # 起点が工程であること（最初の画面が工程選択のドラフト生成）
    assert await pg.is_visible("#procSelect"), "対象工程の選択が最初に出ていない"
    assert await pg.is_visible("#genIdle"), "初期状態が空白になっている"
    idle = await pg.inner_text("#genIdle")
    assert "工程を選択して" in idle, "初期状態の見出しが不適切"
    # 未選択エラー
    await pg.click("#genForm button[type=submit]")
    assert await pg.is_visible("#toastArea .toast"), "工程未選択時のエラーが出ない"
    # 工程10で検証する（新規候補・抜け漏れ候補・AI推定の要求事項の3つが揃う工程）
    await pg.select_option("#procSelect", "10")
    await pg.check('input[name="genMode"][value="wide"]')
    await pg.click("#genForm button[type=submit]")
    await pg.wait_for_selector("#genResult:not([hidden])", timeout=12000)
    r = await pg.inner_text("#genResult")
    for need in ["① 工程フローから機能・作業を整理",
                 "② 図面・条件表・作業標準から要求事項を抽出",
                 "③ 要求事項からの逸脱として故障モードを生成",
                 "さらに、類似工程の実績から確認すべき候補",
                 "製造FMEAドラフト"]:
        assert need in r, f"生成結果に「{need}」がない"
    assert "AI推定・要確認" in r, "AI推定の要求事項が区別されていない"
    assert "逸脱の型" in r, "逸脱の型が表示されていない"
    assert "成立し得ますが" in r, "抜け漏れ候補の理由が型ベースで説明されていない"
    assert "AI候補・要確認" in r, "S/O/DがAI候補として明示されていない"
    assert "設計FMEA" not in r, "設計FMEAの語が残っている（対象は製造FMEAのみ）"
    # 導出の連鎖が根拠パネルで追える
    await pg.click('#genResult [data-ev^="row:"]')
    p = await pg.inner_text("#panelBody")
    assert "工程 → 機能 → 要求事項 → 逸脱 → 故障モード" in p, "導出の連鎖が根拠に示されていない"
    assert "逸脱の型" in p and "要求事項" in p, "根拠パネルに連鎖の各段がない"
    await pg.click("#panelClose")
    # 要求事項の根拠（出典の該当箇所）
    await pg.click('#genResult [data-ev^="req:"]')
    p2 = await pg.inner_text("#panelBody")
    assert "該当箇所" in p2 and "規格値" in p2, "要求事項の根拠に出典箇所がない"
    await pg.click("#panelClose")
    # ドラフトは空から始まり、採用で増える（自動採用していないこと）
    dm = await pg.inner_text("#draftMeta")
    assert "採用0行" in flat(dm), f"生成時点でドラフトに自動追加されている: {dm}"
    await pg.click("#genResult [data-adopt]")
    dm2 = await pg.inner_text("#draftMeta")
    assert "採用1行" in flat(dm2), "採用が反映されない"
    # 類似工程候補も採用できる
    await pg.click("#genResult [data-gapadopt]")
    dm3 = await pg.inner_text("#draftMeta")
    assert "採用2行" in flat(dm3), "類似工程候補の採用が反映されない"
    assert "未確定" in await pg.inner_text("#draftArea"), "ドラフト行が未確定として扱われていない"
    # 20列のCSV出力
    async with pg.expect_download() as dl:
        await pg.click("#btnDraftCsv")
    d = await dl.value
    head = open(await d.path(), encoding="utf-8-sig").readline().rstrip("\r\n")
    cols = head.split(",")
    assert len(cols) == 20, f"出力列数が20でない: {len(cols)}"
    assert "AI提案／人による確定の区分" in head and "逸脱の型" in head, f"CSV列が不足: {head[:120]}"
    # 登録が充実した工程では候補を無理に出さない（空状態に次の手を示す）
    await pg.select_option("#procSelect", "17")
    await pg.click("#genForm button[type=submit]")
    await pg.wait_for_selector("#genResult:not([hidden])", timeout=12000)
    r17 = await pg.inner_text("#genResult")
    assert "追加の故障モード候補は見つかりませんでした" in r17, "候補0件のときの空状態が出ていない"
    assert "参照範囲に他機種" in r17, "空状態に次に試せることが書かれていない"
    await pg.select_option("#procSelect", "10")
    await pg.click("#genForm button[type=submit]")
    await pg.wait_for_selector("#genResult:not([hidden])", timeout=12000)
    # 標準生成では抜け漏れ候補を出さない
    await pg.check('input[name="genMode"][value="std"]')
    await pg.click("#genForm button[type=submit]")
    await pg.wait_for_selector("#genResult:not([hidden])", timeout=12000)
    r2 = await pg.inner_text("#genResult")
    assert "さらに、類似工程の実績から確認すべき候補" not in r2, "標準生成で抜け漏れ候補が出ている"
    # 工程フロー画面から工程を選んで生成できる
    await pg.click('[data-view="flow"]')
    await pg.click("#flowBody [data-pick]")
    await pg.wait_for_selector("#genResult:not([hidden])", timeout=12000)
    assert await pg.is_visible("#genResult"), "工程フローからの生成が動作しない"
    # 既存FMEAの絞り込みとCSV
    await pg.click('[data-view="existing"]')
    b = await pg.inner_text("#exMeta")
    await pg.select_option("#exProc", "17")
    a = await pg.inner_text("#exMeta")
    assert b != a and "絞り込み中" in a, "既存FMEAの絞り込みが効かない"
    async with pg.expect_download() as dl2:
        await pg.click("#btnExCsv")
    await dl2.value
    # 参照文書に評価基準と未登録が出る
    await pg.click('[data-view="docs"]')
    dc = await pg.inner_text('section[data-view="docs"]')
    assert "QS-014" in dc and "未登録" in dc, "参照文書に評価基準・未登録の明示がない"
    return "デモ2：工程起点・機能→要求事項→逸脱→故障モードの連鎖・出典根拠・S/O/D候補の非確定・抜け漏れ候補の手動採用・20列CSV"


CHECKS = {"index": check_index, "01-knowledge": check_01, "02-process-fmea": check_02}


async def main() -> int:
    only = sys.argv[1] if len(sys.argv) > 1 else None
    errors, results = [], []
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for name, fn in CHECKS.items():
            if only and name != only:
                continue
            pg = await b.new_page(viewport={"width": 1440, "height": 900})
            pg.on("pageerror", lambda e, n=name: errors.append(f"[{n}] pageerror: {e}"))
            pg.on("console", lambda m, n=name: errors.append(f"[{n}] console.error: {m.text}")
                  if m.type == "error" else None)
            try:
                results.append(await fn(pg, errors))
            except AssertionError as e:
                errors.append(f"[{name}] {e}")
            await pg.close()
        await b.close()

    for r in results:
        print("  OK  " + r)
    if errors:
        print("\n失敗:")
        for e in errors:
            print("  " + e)
        return 1
    print("\nALL CHECKS PASSED")
    return 0


sys.exit(asyncio.run(main()))
