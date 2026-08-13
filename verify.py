#!/usr/bin/env python3
"""JINGS 営業標準デモ Playwright検証

dist/ の各デモをブラウザで開き、主要導線が動作すること・JSエラーが出ないことを確認する。
デモごとの検証手順は CHECKS に定義する。

使い方:
    python3 verify.py            # 全デモ
    python3 verify.py 01-knowledge
"""
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

DIST = Path(__file__).resolve().parent / "dist"


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


CHECKS = {"index": check_index, "01-knowledge": check_01}


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
