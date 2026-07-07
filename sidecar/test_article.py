"""
NHK Easy 文章解析測試（fixture HTML，無網路）。
跑法：python test_article.py
"""
from article import (
    parse_news_list,
    parse_article,
    tokenize,
    tokens_display,
    tokens_read,
)

FIX_LIST = """
[
  {
    "2026-07-04": [
      {"news_id": "ne2026070411111", "title": "台風が来る",
       "news_prearranged_time": "2026-07-04 12:00:00"},
      {"news_id": "ne2026070422222", "title": "駅で祭り",
       "news_prearranged_time": "2026-07-04 11:00:00"}
    ],
    "2026-07-03": [
      {"news_id": "ne2026070333333", "title": "米が高い",
       "news_prearranged_time": "2026-07-03 18:00:00"}
    ]
  }
]
"""

FIX_ARTICLE = """
<html><head><title>x</title></head><body>
<h1 class="article-title"><ruby>台風<rt>たいふう</rt></ruby>が<ruby>来<rt>く</rt></ruby>る</h1>
<div id="js-article-body" class="article-body">
<p><ruby>日本<rt>にほん</rt></ruby>に<ruby>台風<rt>たいふう</rt></ruby>が<ruby>来<rt>き</rt></ruby>ます。みなさん、<ruby>気<rt>き</rt></ruby>をつけてください。</p>
<p><a href="/x"><ruby>雨<rt>あめ</rt></ruby></a>が たくさん <ruby>降<rt>ふ</rt></ruby>ります。</p>
</div>
</body></html>
"""

pass_n = 0
fail_n = 0


def ok(name: str, cond: bool) -> None:
    global pass_n, fail_n
    if cond:
        pass_n += 1
        print(f"✓ {name}")
    else:
        fail_n += 1
        print(f"✗ {name}")


# ── news-list ──
arts = parse_news_list(FIX_LIST)
ok("列表解析出 3 篇", len(arts) == 3)
ok("依日期新到舊", arts[0]["id"].startswith("ne20260704") and arts[-1]["id"] == "ne2026070333333")
ok("欄位齊全", all(a["id"] and a["title"] and a["date"] for a in arts))

# ── tokenize / 讀音 / display ──
toks = tokenize('<ruby>台風<rt>たいふう</rt></ruby>が<b>来る</b>')
ok("ruby 讀音保留、其他標籤剝除", toks == [("台風", "たいふう"), ("が来る", None)])
ok("read＝ruby 用讀音", tokens_read(toks) == "たいふうが来る")
ok(
    "display 由 token 重建（escape 防注入）",
    tokens_display(tokenize('<ruby>山<rt>やま</rt></ruby><script>alert(1)</script>&amp;'))
    == "<ruby>山<rt>やま</rt></ruby>alert(1)&amp;",
)

# ── 整篇解析 ──
art = parse_article(FIX_ARTICLE)
ok("標題含 ruby display", "<ruby>台風<rt>たいふう</rt></ruby>" in art["title"])
ok("標題讀音", art["title_read"] == "たいふうがくる")
ok("依「。」切成 3 句", len(art["lines"]) == 3)
ok("第一句讀音正確", art["lines"][0]["read"] == "にほんにたいふうがきます。")
ok("第二句（呼籲句）在", art["lines"][1]["read"] == "みなさん、きをつけてください。")
ok("連結標籤剝除、ruby 保留", art["lines"][2]["jp"].startswith("<ruby>雨<rt>あめ</rt></ruby>"))
ok("display 不含 a/script 標籤", "<a" not in art["lines"][2]["jp"])

print(f"\n{'後端文章解析測試全部通過' if fail_n == 0 else f'{fail_n} 項失敗'}（{pass_n} passed）")
raise SystemExit(0 if fail_n == 0 else 1)
