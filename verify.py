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

DIST = Path(__file__).resolve().parent / "docs"


def flat(s: str) -> str:
    """inner_text は要素境界で改行を挟むため、空白を潰して比較する。"""
    return re.sub(r"\s+", "", s)


async def check_index(pg, errors):
    await pg.goto((DIST / "index.html").as_uri())
    txt = await pg.inner_text(".lp")
    assert "製造業向けAIデモ" in txt, "トップの見出しがない"
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
    # 帳票の実物スクショ（出典の裏取り）— 要対応の記録すべてで出ること
    rows = await pg.eval_on_selector_all("#openBody [data-tr]", "e => e.map(x => x.dataset.tr)")
    assert rows, "要対応の記録がない"
    for tid in rows:
        await pg.click(f'#openBody [data-tr="{tid}"]')
        assert await pg.query_selector("#panelBody .sheet-shot img"), f"{tid} に帳票スクショがない"
        ok = await pg.eval_on_selector("#panelBody .sheet-shot img",
                                       "e => e.complete && e.naturalWidth > 600")
        assert ok, f"{tid} の帳票スクショが読み込めていない"
        await pg.click("#panelClose")
    # 拡大表示
    await pg.click(f'#openBody [data-tr="{rows[0]}"]')
    await pg.click("#panelBody .sheet-shot")
    assert await pg.is_visible(".shot-zoom img"), "拡大表示が開かない"
    await pg.click(".shot-zoom")
    await pg.click("#panelClose")
    # チャット：挨拶が出ている
    await pg.click('[data-view="search"]')
    assert await pg.query_selector("#chatLog .msg--ai"), "チャットの初回メッセージが出ていない"
    g = await pg.inner_text("#chatLog")
    assert "答えられること" in g and "原因の断定はしません" in g, "答えられる範囲と限界が示されていない"
    # 未入力エラー
    await pg.click("#qForm button[type=submit]")
    assert await pg.is_visible("#toastArea .toast"), "未入力時のエラー通知が出ない"
    # 例文から質問→回答
    await pg.click("#qChips .chip")
    await pg.wait_for_selector("#chatLog .followup", timeout=15000)
    n1 = await pg.eval_on_selector_all("#chatLog .msg", "e => e.length")
    assert n1 == 3, f"挨拶＋質問＋回答の3件にならない: {n1}"
    r = await pg.inner_text("#chatLog")
    assert "確認結果" in r and "類似する不具合記録" in r, "回答の中身が不足"
    assert "工程FMEAに登録済みの故障モード" in r, "工程FMEAとの照合が出ていない"
    assert "今回確認すべき項目" in r, "確認項目が出ていない"
    assert "参照：不具合記録" in r, "参照元の件数が示されていない"
    # 回答内の根拠パネルが開く
    await pg.click("#chatLog [data-fm]")
    p2 = await pg.inner_text("#panelBody")
    assert "工程FMEAの記載" in p2 and "RPN" in p2, "FMEA根拠パネルの中身が不足"
    await pg.click("#panelClose")
    # 続けて聞く（会話が続き、文脈を引き継ぐ）
    # 回答が完成すると followup が増えるので、それを完了の合図にする
    await pg.click("#chatLog .followup .chip")
    await pg.wait_for_function(
        "document.querySelectorAll('#chatLog .followup').length >= 2", timeout=15000)
    n2 = await pg.eval_on_selector_all("#chatLog .msg", "e => e.length")
    assert n2 >= 5, f"追加質問で会話が続かない: {n2}"
    # 会話をやり直すと履歴が消える
    await pg.click("#btnChatClear")
    n3 = await pg.eval_on_selector_all("#chatLog .msg", "e => e.length")
    assert n3 == 1, f"やり直しで挨拶だけに戻らない: {n3}"
    # 一致なしのときは次の手を示す
    await pg.fill("#q", "該当しない語句をあえて入力して空状態を確認する")
    await pg.click("#qForm button[type=submit]")
    # 最後のAI回答が空状態になるまで待つ
    await pg.wait_for_function(
        "(() => { const a = document.querySelectorAll('#chatLog .msg--ai');"
        " return a.length > 1 && a[a.length - 1].innerText.includes('見つかりませんでした'); })()",
        timeout=15000)
    r2 = await pg.inner_text("#chatLog")
    assert "追加で試せること" in r2, "空状態に次の手が示されていない"
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
    return "デモ1：チャットで対話（文脈引き継ぎ・続けて聞く・やり直し）・根拠パネル・帳票実物・空状態・CSV"


async def check_02(pg, errors):
    await pg.goto((DIST / "02-process-fmea.html").as_uri())
    # 投げ込み入口（1ファイルから始められることを示す）
    await pg.click("#btnFlowSample")
    await pg.wait_for_selector("#flowReadout:not([hidden])", timeout=6000)
    dr = await pg.inner_text("#flowReadout")
    assert "読み取りました" in dr, "工程フローを投げ込んでも読み取り結果が出ない"
    assert "サンプルを表示" in dr, "デモ環境である旨の断りがない"
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
    # 参照範囲のチェックボックスが実際に効くこと（飾りになっていないこと）
    await pg.select_option("#procSelect", "10")
    await pg.click("#genForm button[type=submit]")
    await pg.wait_for_selector("#genResult:not([hidden])", timeout=12000)
    n_all = await pg.eval_on_selector_all("#genResult tbody tr", "e => e.length")
    await pg.uncheck("#rfDwg")
    await pg.click("#genForm button[type=submit]")
    await pg.wait_for_selector("#genResult:not([hidden])", timeout=12000)
    n_off = await pg.eval_on_selector_all("#genResult tbody tr", "e => e.length")
    assert n_all != n_off, f"参照範囲を外しても結果が変わらない（飾りになっている）: {n_all} vs {n_off}"
    await pg.check("#rfDwg")
    await pg.uncheck("#rfFmea")
    await pg.click("#genForm button[type=submit]")
    await pg.wait_for_selector("#genResult:not([hidden])", timeout=12000)
    assert "未評価" in await pg.inner_text("#genResult"), "既存FMEAを外してもS/O/Dが出てしまう"
    await pg.check("#rfFmea")
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


async def check_03(pg, errors):
    await pg.goto((DIST / "03-drbfm.html").as_uri())
    # 設計系デモの承認マーカーが入っていること
    html = await pg.content()
    assert "scope:design-fmea-approved" in html, "設計系デモの承認マーカーがない"
    # 起点は帳票選択ではなくファイル投げ込み。読み取るまで生成できない
    assert await pg.is_visible("#triggerFile"), "起点のファイル投入欄がない"
    assert await pg.is_disabled("#btnGen"), "読み取り前に生成ボタンが押せてしまう"
    await pg.click("#btnSample")
    ro = await pg.inner_text("#readout")
    assert "ACT-230" in ro and "読み取りました" in ro, "読み取り結果が出ない"
    assert "サンプルを表示しています" in ro, "デモであることが明記されていない"
    assert not await pg.is_disabled("#btnGen"), "読み取り後も生成ボタンが押せない"
    # 生成 → 途中で人に確認するモーダルが出て止まる
    await pg.click("#btnGen")
    await pg.wait_for_selector(".modal", timeout=8000)
    m = await pg.inner_text(".modal")
    assert "類似部材の判定" in m, "類似判定の確認モーダルが出ない"
    assert "記録され" in m, "判断が記録される旨の明記がない"
    opts = await pg.eval_on_selector_all(".modal__opt", "e=>e.length")
    assert opts == 3, f"選択肢が3択でない: {opts}"
    assert await pg.is_visible("#genLoading"), "モーダル中に生成が進んでしまっている"
    # 「条件付きで引き継ぐ」を選ぶと要再評価が付く
    await pg.click('.modal__opt[data-opt="1"]')
    await pg.wait_for_selector("#genResult:not([hidden])", timeout=12000)
    r = await pg.inner_text("#genResult")
    assert "条件付きで引き継ぐ" in r, "選んだ判定が結果に反映されていない"
    assert "要再評価" in r, "条件付き引き継ぎの要再評価が付いていない"
    # 4系統バッジ（過去実績だけでないことを示す）
    for kind in ["過去実績", "機能演繹", "物理推論"]:
        assert kind in r, f"生成系統「{kind}」が表示されていない"
    assert "過去実績のない領域" in r, "過去実績のない領域の件数が出ていない"
    # 根拠パネル：過去記録がない行は演繹で生成したと明示される
    await pg.click("#genResult [data-ev]")
    p1 = await pg.inner_text("#panelBody")
    assert "この心配点を導いた過程" in p1, "導出過程が根拠に出ていない"
    await pg.click("#panelClose")
    # インライン編集で行が担当者修正済みになる
    cell = await pg.query_selector("#genResult .editcell")
    await cell.click()
    await pg.keyboard.type("（試験条件を追記）")
    edited = await pg.eval_on_selector_all('#genResult tr[data-edited="true"]', "e=>e.length")
    assert edited >= 1, "編集しても行の状態が変わらない"
    note = await pg.inner_text("#editNote")
    assert "担当者が修正" in note, "編集件数が表示されていない"
    # CSV出力（生成系統の列を含む）
    async with pg.expect_download() as dl:
        await pg.click("#btnCsv")
    d = await dl.value
    head = open(await d.path(), encoding="utf-8-sig").readline()
    assert "生成系統" in head and "心配点" in head, f"CSV列が不足: {head[:100]}"
    # 別部材として扱うと過去実績由来の行が除外される
    await pg.click("#btnGen")
    await pg.wait_for_selector(".modal", timeout=8000)
    await pg.click('.modal__opt[data-opt="2"]')
    await pg.wait_for_selector("#genResult:not([hidden])", timeout=12000)
    r2 = await pg.inner_text("#genResult")
    assert "別部材として扱う" in r2, "判定が反映されていない"
    past_badges = await pg.eval_on_selector_all("#genResult .src--past", "e=>e.length")
    assert past_badges == 0, f"別部材扱いでも過去実績由来の行が残っている: {past_badges}件"
    deduced = await pg.eval_on_selector_all("#genResult .src--func, #genResult .src--phys", "e=>e.length")
    assert deduced > 0, "演繹系統の行まで消えている"
    # 参照文書に4系統の説明と未登録がある
    await pg.click('[data-view="docs"]')
    dc = await pg.inner_text('section[data-view="docs"]')
    assert "機能演繹" in dc and "未登録" in dc, "参照文書に系統説明・未登録の明示がない"
    return "デモ3：発議書起点・読み取り前は生成不可・類似判定を人に確認・4系統バッジ・要再評価付与・インライン編集・CSV"


async def check_04(pg, errors):
    await pg.goto((DIST / "04-design-review.html").as_uri())
    # 手順1：過去のDR議事録から確認すべき観点を起こす
    await pg.click("#btnPastSample")
    await pg.click("#btnPastRun")
    await pg.wait_for_selector("#pastResult:not([hidden])", timeout=25000)
    n = await pg.eval_on_selector_all("#pastResult [data-adopt]", "e => e.length")
    assert n >= 5, f"議事録から観点が起きていない: {n}"
    past = await pg.inner_text("#pastResult")
    assert "回" in past and "項目にしなかった発言" in past, "回数と保留分が出ていない"
    # 手順2：今回の帳票から指摘を出す
    await pg.click("#btnDocSample")
    await pg.click("#btnDocRun")
    await pg.wait_for_selector("#docResult:not([hidden])", timeout=25000)
    m = await pg.eval_on_selector_all("#docResult [data-raise]", "e => e.length")
    assert m >= 5, f"帳票から指摘が出ていない: {m}"
    doc = await pg.inner_text("#docResult")
    assert "帳票の記載" in doc and "DRで求めること" in doc, "指摘の中身が不足"
    assert "確認できず" in doc, "記載を見つけられなかった項目が区別されていない"
    # ここからゲートの確認
    await pg.click('[data-view="gates"]')
    kpi = await pg.inner_text("#kpiGrid")
    assert "DR3" in kpi and "未完了の指摘" in kpi, "ゲートのKPIが出ていない"
    gates = await pg.inner_text("#gateBody")
    assert "DR1" in gates and "DR4" in gates, "ゲート一覧が出ていない"
    assert await pg.inner_text("#carryBody"), "持ち越し指摘が出ていない"
    # 完了扱いの指摘の見落とし検出
    assert "完了扱いだが再確認が必要" in kpi, "見落とし検出のKPIが出ていない"
    mc = await pg.locator("#missCards .kcard").count()
    assert mc >= 1, f"完了扱いの指摘の見落としを検出できていない: {mc}件"
    mtxt = await pg.inner_text("#missCards")
    assert "DR2-07" in mtxt and "ECN-2026-009" in mtxt, "見落としの根拠（指摘番号と設計変更番号）が出ていない"
    assert "変更前の条件" in mtxt, "なぜ再確認が必要かの説明がない"
    await pg.click('#missCards [data-missev="0"]')
    mp = await pg.inner_text("#panelBody")
    for k in ["完了にした指摘", "指摘の根拠になった不具合", "設計変更", "判定"]:
        assert k in mp, f"たどった経路の「{k}」が出ていない"
    assert "2026-01-31" in mp and "2026-07-15" in mp, "日付の前後関係が示されていない"
    await pg.click("#panelClose")
    # 審査準備：未選択エラー
    await pg.click('[data-view="prep"]')
    await pg.select_option("#gateSelect", "")
    await pg.click("#prepForm button[type=submit]")
    assert await pg.is_visible("#gateError"), "ゲート未選択のエラーが出ない"
    # DR3で絞り込み
    await pg.select_option("#gateSelect", "DR3")
    await pg.click("#prepForm button[type=submit]")
    await pg.wait_for_selector("#prepResult:not([hidden])", timeout=12000)
    r = await pg.inner_text("#prepResult")
    assert "重点確認" in r and "標準項目" in r, "優先度の区分が出ていない"
    assert await pg.locator("#prepResult .callout--error").count() >= 1, "審査準備の結果に見落としの指摘が出ていない"
    assert "削除していません" in r, "標準項目を削らない旨の明記がない"
    for k in ["変更点", "過去不具合", "前回指摘"]:
        assert k in r, f"突き合わせ元「{k}」が出ていない"
    # 標準項目もすべて残っていること（AIが項目を削らない）
    rows = await pg.eval_on_selector_all("#prepResult tbody tr", "e=>e.length")
    assert rows == 12, f"標準の確認項目が削られている: {rows}件"
    # 根拠パネル
    await pg.click("#prepResult [data-ev]")
    p1 = await pg.inner_text("#panelBody")
    assert "根拠" in p1 or "対応" in p1, "根拠パネルの中身が不足"
    await pg.click("#panelClose")
    # 起票 → 指摘一覧に増える
    before = await pg.inner_text("#kpiGrid")
    await pg.click("#prepResult [data-raise]")
    await pg.click('[data-view="findings"]')
    fm = await pg.inner_text("#findMeta")
    assert "DR3-" in await pg.inner_text("#findBody"), "起票した指摘が一覧に出ない"
    # 完了にすると状態が変わる
    await pg.click("#findBody [data-close]")
    assert await pg.is_visible("#toastArea .toast"), "完了操作の通知が出ない"
    # 絞り込みと空状態
    await pg.select_option("#fGate", "DR1")
    assert await pg.is_visible("#findEmpty"), "該当なしの空状態が出ない"
    await pg.select_option("#fGate", "")
    async with pg.expect_download() as dl:
        await pg.click("#btnFindCsv")
    d = await dl.value
    head = open(await d.path(), encoding="utf-8-sig").readline()
    assert "指摘番号" in head, f"CSV列が不正: {head[:80]}"
    # 完了扱いの突き合わせを外すと結果が変わる（飾りのチェックボックスでないこと）
    await pg.click('[data-view="prep"]')
    await pg.uncheck("#mxDone")
    await pg.click("#prepForm button[type=submit]")
    await pg.wait_for_selector("#prepResult:not([hidden])", timeout=12000)
    assert await pg.locator("#prepResult .callout--error").count() == 0, \
        "完了扱いを外しても見落としの指摘が残っている（飾りになっている）"
    await pg.click('[data-view="gates"]')
    off = await pg.locator("#missCards .kcard").count()
    assert off == 0, f"完了扱いを外しても検出結果が消えない: {off}件"
    await pg.click('[data-view="prep"]')
    await pg.check("#mxDone")
    await pg.click("#prepForm button[type=submit]")
    await pg.wait_for_selector("#prepResult:not([hidden])", timeout=12000)
    # 見落としから起票すると、DR3の指摘として立つ
    await pg.click('[data-view="gates"]')
    rb = await pg.query_selector('#missCards [data-missraise="0"]')
    if rb:
        await rb.click()
        after = await pg.inner_text("#missCards")
        assert "同じ観点に当たります" in after, "起票してもカードの表示が変わらない"
    # 過去指摘の横展開
    await pg.click('[data-view="carry"]')
    c = await pg.inner_text('section[data-view="carry"]')
    assert "横展開" in c, "横展開の画面が出ていない"
    card = await pg.query_selector("#carryCards [data-carryadd]")
    if card:
        await pg.click("#carryCards [data-carryev]")
        await pg.click("#panelClose")
        await pg.click("#carryCards [data-carryadd]")
        assert await pg.query_selector('.kcard[data-state="approved"]'), "追加してもカードの状態が変わらない"
    return "デモ4：ゲート管理・完了扱いの指摘の見落とし検出・標準項目を削らない絞り込み・突き合わせ根拠・起票と完了の追跡・横展開"


async def check_05(pg, errors):
    await pg.goto((DIST / "05-drawing.html").as_uri())
    await pg.click("#ckForm button[type=submit]")
    assert await pg.is_visible("#dwgError"), "図面未選択のエラーが出ない"
    # 投げ込み入口（1ファイルから始められることを示す）
    await pg.click("#btnDwgSample")
    await pg.wait_for_selector("#dwgReadout:not([hidden])", timeout=6000)
    dr = await pg.inner_text("#dwgReadout")
    assert "読み取りました" in dr, "図面を投げ込んでも読み取り結果が出ない"
    assert "サンプルを表示" in dr, "デモ環境である旨の断りがない"
    assert await pg.input_value("#dwgSelect") == "ACT-230-300", "投げ込んだ内容が対象の選択に反映されない"
    await pg.select_option("#dwgSelect", "ACT-230-300")
    await pg.click("#ckForm button[type=submit]")
    await pg.wait_for_selector("#ckResult:not([hidden])", timeout=12000)
    r = await pg.inner_text("#ckResult")
    assert "確認候補" in r and "検図ルール" in r, "検図結果の構成が不足"
    assert "R-0" in r, "どの検図ルールに対する不足かが出ていない"
    assert "設計意図" in r, "確認範囲の限界が明記されていない"
    assert await pg.query_selector("#ckResult svg.dwg"), "図面の簡易表示がない"
    # 根拠にルール原文と過去不具合が出る
    await pg.click("#ckResult [data-ev]")
    p1 = await pg.inner_text("#panelBody")
    assert "照合した検図ルール" in p1, "根拠にルールが出ていない"
    assert "図面属性表" in p1, "図面属性表の実物が出ていない"
    ok = await pg.eval_on_selector("#panelBody .sheet-shot img",
                                   "e => e.complete && e.naturalWidth > 600")
    assert ok, "図面属性表のスクショが読み込めていない"
    await pg.click("#panelClose")
    async with pg.expect_download() as dl:
        await pg.click("#btnCkCsv")
    d = await dl.value
    head = open(await d.path(), encoding="utf-8-sig").readline()
    assert "検図ルール番号" in head, f"CSV列が不正: {head[:80]}"
    # 類似図面検索
    await pg.click('[data-view="search"]')
    await pg.click("#sForm button[type=submit]")
    assert await pg.is_visible("#toastArea .toast"), "未入力エラーが出ない"
    await pg.click("#sChips .chip")
    s = await pg.inner_text("#sResult")
    assert "関連度" in s, "検索結果が出ない"
    await pg.fill("#sq", "まったく無関係な語句で空状態を確認する")
    await pg.click("#sForm button[type=submit]")
    s2 = await pg.inner_text("#sResult")
    assert "見つかりませんでした" in s2 and "追加で試せること" in s2, "空状態に次の手がない"
    # 一覧から検図へ
    await pg.click('[data-view="list"]')
    await pg.click("#listBody [data-check]")
    await pg.wait_for_selector("#ckResult:not([hidden])", timeout=12000)
    # ルール画面
    await pg.click('[data-view="rules"]')
    ru = await pg.inner_text('section[data-view="rules"]')
    assert "R-01" in ru and "読み取り対象外" in ru, "ルール画面の説明が不足"
    return "デモ5：検図ルール起点・ルール原文と過去不具合の根拠・簡易図面・類似検索と空状態・CSV"


async def check_06(pg, errors):
    await pg.goto((DIST / "06-8d-report.html").as_uri())
    await pg.click("#genForm button[type=submit]")
    assert await pg.is_visible("#trError"), "不具合未選択のエラーが出ない"
    # 投げ込み入口（1ファイルから始められることを示す）
    await pg.click("#btnClSample")
    await pg.wait_for_selector("#clReadout:not([hidden])", timeout=6000)
    dr = await pg.inner_text("#clReadout")
    assert "読み取りました" in dr, "クレーム票を投げ込んでも読み取り結果が出ない"
    assert "サンプルを表示" in dr, "デモ環境である旨の断りがない"
    assert await pg.input_value("#trSelect") == "QT-2023-0187", "投げ込んだ内容が対象の選択に反映されない"
    # 顧客流出のある記録で作成
    await pg.select_option("#trSelect", "QT-2023-0187")
    await pg.click("#genForm button[type=submit]")
    await pg.wait_for_selector("#genResult:not([hidden])", timeout=12000)
    r = await pg.inner_text("#genResult")
    for d in ["D1", "D2", "D4", "D7", "D8"]:
        assert d in r, f"{d}の項目がない"
    assert "追記が必要です" in r, "空欄項目の追記指示が出ていない"
    assert "推測で埋めず" in r, "推測で埋めない方針が明記されていない"
    assert "発生原因" in r and "流出原因" in r, "原因が発生と流出に分かれていない"
    # D1・D8はAIが埋めない
    rows = await pg.eval_on_selector_all("#genResult tbody tr", "e=>e.length")
    assert rows == 8, f"8D の項目数が8でない: {rows}"
    unfilled = await pg.eval_on_selector_all("#genResult .status--warn", "e=>e.length")
    assert unfilled >= 2, "未記入として扱われる項目が少なすぎる（D1・D8は埋めない方針）"
    # 編集すると担当者修正済みになる
    cell = await pg.query_selector("#genResult .editcell")
    await cell.click()
    await pg.keyboard.type("（確認済み）")
    assert await pg.eval_on_selector_all('#genResult tr[data-edited="true"]', "e=>e.length") >= 1, "編集が反映されない"
    # 出力（未記入があると警告）
    async with pg.expect_download() as dl:
        await pg.click("#btnCsv")
    d = await dl.value
    body = open(await d.path(), encoding="utf-8-sig").read()
    assert "D1" in body and "未記入" in body, "CSVに未記入の状態が出ていない"
    # 出典に苦情報告書の実物が出る
    assert "この初稿の出典" in r, "出典セクションがない"
    ok = await pg.eval_on_selector("#genResult .sheet-shot img",
                                   "e => e.complete && e.naturalWidth > 600")
    assert ok, "苦情報告書のスクショが読み込めていない"
    # 保存すると履歴に出る
    await pg.click("#btnSave")
    await pg.click('[data-view="list"]')
    lst = await pg.inner_text('section[data-view="list"]')
    assert "QT-2023-0187" in lst, "保存した報告書が履歴に出ない"
    # 様式画面
    await pg.click('[data-view="form"]')
    fm = await pg.inner_text('section[data-view="form"]')
    assert "AIは記入しません" in fm, "AIが埋めない項目の明示がない"
    return "デモ6：記録からの割り当て・空欄と追記指示・発生/流出原因の分離・編集・出力・履歴"


async def check_07(pg, errors):
    await pg.goto((DIST / "07-change-impact.html").as_uri())
    await pg.click("#impForm button[type=submit]")
    assert await pg.is_visible("#ecnError"), "変更未選択のエラーが出ない"
    # 暫定・未反映・共連れが揃う ECN-2026-009 で検証
    await pg.select_option("#ecnSelect", "ECN-2026-009")
    await pg.click("#impForm button[type=submit]")
    await pg.wait_for_selector("#impResult:not([hidden])", timeout=12000)
    r = await pg.inner_text("#impResult")
    assert "段階：暫定" in r, "段階が表示されていない"
    # 未反映と確認できずを区別している
    assert "未反映" in r and "確認できず" in r, "未反映と確認できずが区別されていない"
    assert "反映済みとしては扱っていません" in r, "確認できずの扱いが明記されていない"
    assert "共連れ変更" in r, "共連れ変更のセクションがない"
    assert "配布先" in r, "配布先が出ていない"
    assert "影響する工程に登録済みの故障モード" in r, "影響工程のFMEAが出ていない"
    # 状態バッジの内訳を要素で確認
    o = await pg.eval_on_selector_all("#impResult .status--risk", "e => e.length")
    u = await pg.eval_on_selector_all("#impResult .status--todo", "e => e.length")
    assert o > 0 and u > 0, f"未反映/確認できずのバッジが出ていない: open={o} unknown={u}"
    # 未反映は起票、確認できずは文書登録依頼に分岐する
    await pg.click("#impResult [data-task]")
    assert await pg.is_visible("#toastArea .toast"), "反映作業の起票の通知が出ない"
    await pg.click("#impResult [data-need]")
    # 工程FMEAの根拠に帳票の実物が出る
    await pg.click("#impResult [data-fmea]")
    p1 = await pg.inner_text("#panelBody")
    assert "工程FMEAの記載" in p1, "根拠パネルの中身が不足"
    ok = await pg.eval_on_selector("#panelBody .sheet-shot img",
                                   "e => e.complete && e.naturalWidth > 600")
    assert ok, "帳票スクショが読み込めていない"
    await pg.click("#panelClose")
    # 共連れ変更へジャンプできる
    await pg.click("#impResult [data-jump]")
    await pg.wait_for_selector("#impResult:not([hidden])", timeout=12000)
    r2 = await pg.inner_text("#impResult")
    assert "ECN-2026-011" in r2, "共連れ変更へ移動できない"
    assert "この変更が前提" in r2, "逆方向の共連れ関係が出ていない"
    # CSV出力
    async with pg.expect_download() as dl:
        await pg.click("#btnImpCsv")
    d = await dl.value
    body = open(await d.path(), encoding="utf-8-sig").read()
    assert "共連れ変更" in body and "確認できず" in body, "CSVに共連れ・確認できずがない"
    # 変更一覧：暫定が先頭
    await pg.click('[data-view="list"]')
    kpi = await pg.inner_text("#kpiGrid")
    assert "確認できない項目" in kpi, "確認できない項目のKPIがない"
    first = await pg.inner_text("#listBody tr:first-child")
    assert "暫定" in first, "暫定の変更が先頭に来ていない"
    async with pg.expect_download() as dl2:
        await pg.click("#btnListCsv")
    await dl2.value
    # マトリクス：反映率の分母問題を明示している
    await pg.click('[data-view="matrix"]')
    m = await pg.inner_text('section[data-view="matrix"]')
    assert "反映率" in m and "分母" in m, "反映率の分母の扱いが説明されていない"
    async with pg.expect_download() as dl3:
        await pg.click("#btnMatCsv")
    await dl3.value
    # 参照文書：未登録が追跡できない旨
    await pg.click('[data-view="docs"]')
    dc = await pg.inner_text("#docsBody")
    assert "未登録" in dc and "追跡できません" in dc, "未登録文書の影響が明示されていない"
    return "デモ7：段階（暫定/最終）・未反映と確認できずの区別・共連れ変更の双方向・反映率の分母問題・マトリクス・CSV"


async def check_08(pg, errors):
    await pg.goto((DIST / "08-fta.html").as_uri())
    await pg.click("#ftForm button[type=submit]")
    assert await pg.is_visible("#topError"), "現象未選択のエラーが出ない"
    # 候補なしの分類がある現象で検証（FT-001は環境が候補なし）
    await pg.select_option("#topSelect", "FT-001")
    await pg.click("#ftForm button[type=submit]")
    await pg.wait_for_selector("#ftResult:not([hidden])", timeout=12000)
    r = await pg.inner_text("#ftResult")
    assert "原因の分岐（5M1E）" in r, "5M1Eの分岐が出ていない"
    # 6分類すべてが図に出る（候補0件の分類も枠を残す）
    cats = await pg.eval_on_selector_all("#ftResult [data-cat]", "e => e.length")
    assert cats == 6, f"6分類すべてが出ていない: {cats}"
    empties = await pg.eval_on_selector_all("#ftResult .bx--cat-empty", "e => e.length")
    assert empties >= 1, "候補なしの分類が破線で示されていない"
    assert "候補なしの分類" in r, "候補なしの分類のセクションがない"
    assert "候補が挙がっていません" in r, "掘り下げ不足の指摘がない"
    assert "推定" in r and "実績あり" in r, "実績と推定が区別されていない"
    # 現象・分類・原因それぞれの根拠が開く
    await pg.click('#ftResult [data-node="top"]')
    p0 = await pg.inner_text("#panelBody")
    assert "分類ごとの候補数" in p0, "現象の詳細に分類別の件数がない"
    await pg.click("#panelClose")
    await pg.click("#ftResult .bx--cat-empty")
    p1 = await pg.inner_text("#panelBody")
    assert "候補が挙がっていません" in p1, "候補なし分類の説明がない"
    assert "原因になり得ないとは限りません" in p1, "候補なしの解釈の注意がない"
    await pg.click("#panelClose")
    await pg.click("#ftResult [data-cause]")
    p2 = await pg.inner_text("#panelBody")
    assert "分類" in p2 and "発生度O" in p2, "原因の根拠パネルの中身が不足"
    ok = await pg.eval_on_selector("#panelBody .sheet-shot img",
                                   "e => e.complete && e.naturalWidth > 600")
    assert ok, "帳票スクショが読み込めていない"
    await pg.click("#panelClose")
    # 紐づける実績のチェックボックスが実際に効くこと
    hit_on = await pg.eval_on_selector_all("#ftResult .bx--basic-hit", "e => e.length")
    await pg.uncheck("#lkTr")
    await pg.click("#ftForm button[type=submit]")
    await pg.wait_for_selector("#ftResult:not([hidden])", timeout=12000)
    hit_off = await pg.eval_on_selector_all("#ftResult .bx--basic-hit", "e => e.length")
    assert hit_on != hit_off, f"実績の参照を外しても変わらない（飾りになっている）: {hit_on} vs {hit_off}"
    await pg.check("#lkTr")
    await pg.click("#ftForm button[type=submit]")
    await pg.wait_for_selector("#ftResult:not([hidden])", timeout=12000)
    # CSV（候補なしの分類も出力される）
    async with pg.expect_download() as dl:
        await pg.click("#btnFtCsv")
    d = await dl.value
    body = open(await d.path(), encoding="utf-8-sig").read()
    assert "候補が挙がっていない分類" in body and "推定" in body, "CSVに候補なし・推定がない"
    # 原因一覧
    await pg.click('[data-view="basic"]')
    b = await pg.inner_text('section[data-view="basic"]')
    assert "推定" in b, "原因一覧に推定の明示がない"
    async with pg.expect_download() as dl2:
        await pg.click("#btnBasicCsv")
    await dl2.value
    # FMEAとの関係：向きの違いと未登録の原因
    await pg.click('[data-view="compare"]')
    c = await pg.inner_text('section[data-view="compare"]')
    assert "原因 → 影響" in c and "結果 → 原因" in c, "FMEAとFTAの向きの違いが説明されていない"
    assert "工程FMEAに登録がない原因" in c, "工程FMEA未登録の原因のセクションがない"
    await pg.click("#gapBody [data-toproc]")
    assert await pg.is_visible("#toastArea .toast"), "検討依頼の通知が出ない"
    # 参照文書
    await pg.click('[data-view="docs"]')
    dc = await pg.inner_text("#docsBody")
    assert "未登録" in dc, "未登録文書が明示されていない"
    return "デモ8：現象起点・5M1Eの6分類・候補なしの分類を残す・実績と推定の区別・FMEAとの向きの違い・CSV"


CHECKS = {"index": check_index, "01-knowledge": check_01, "02-process-fmea": check_02,
          "03-drbfm": check_03, "04-design-review": check_04,
          "05-drawing": check_05, "06-8d-report": check_06,
          "07-change-impact": check_07, "08-fta": check_08}


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
