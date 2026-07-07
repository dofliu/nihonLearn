"""
NHK やさしいニュース（NHK News Web Easy）文章解析。

資料誠信設計：振り仮名（ruby）直接繼承 NHK 的人工標註，LLM 不參與注音。
LLM 只負責中文對照與生詞解說（見 main.py /article/annotate），
且產物一律 needs_review，經前端審核採用後才入庫。

純函式、無網路依賴——test_article.py 用 fixture HTML 驗證。
display HTML 由 token 重建（全部 escape 後只產生 <ruby>/<rt>），
天然免疫 XSS（前端用 dangerouslySetInnerHTML 渲染）。
"""
from __future__ import annotations

import html as _html
import json
import re

NEWS_LIST_URL = "https://www3.nhk.or.jp/news/easy/news-list.json"


def article_url(news_id: str) -> str:
    return f"https://www3.nhk.or.jp/news/easy/{news_id}/{news_id}.html"


# ── news-list.json ───────────────────────────────────────────
def parse_news_list(raw: str | bytes, limit: int = 12) -> list[dict]:
    """
    NHK 的列表結構是「日期 → 文章陣列」的巢狀 JSON，且外層包裝偶有變動。
    這裡不假設外形：遞迴走訪，凡是帶 news_id + title 的 dict 都收。
    """
    data = json.loads(raw)
    found: list[dict] = []

    def walk(node) -> None:
        if isinstance(node, dict):
            if "news_id" in node and "title" in node:
                found.append(
                    {
                        "id": str(node["news_id"]),
                        "title": str(node["title"]),
                        "date": str(node.get("news_prearranged_time", ""))[:10],
                    }
                )
            else:
                for v in node.values():
                    walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(data)
    # 去重（同 id 取先出現者）、新的在前
    seen: set[str] = set()
    uniq = []
    for a in found:
        if a["id"] in seen:
            continue
        seen.add(a["id"])
        uniq.append(a)
    uniq.sort(key=lambda a: a["date"], reverse=True)
    return uniq[:limit]


# ── 文章 HTML → tokens → lines ──────────────────────────────
# <ruby>漢字<rt>かんじ</rt></ruby>（部分頁面 base 會再包 <rb>）
_RUBY_RE = re.compile(r"<ruby>(?:<rb>)?([^<]*)(?:</rb>)?\s*<rt>([^<]*)</rt>\s*</ruby>", re.S)
_TAG_RE = re.compile(r"<[^>]+>")


def _strip_tags(fragment: str) -> str:
    return _html.unescape(_TAG_RE.sub("", fragment))


def tokenize(fragment: str) -> list[tuple[str, str | None]]:
    """HTML 片段 → [(文字, 讀音|None)]。ruby 的讀音保留，其餘標籤剝除。"""
    out: list[tuple[str, str | None]] = []
    pos = 0
    for m in _RUBY_RE.finditer(fragment):
        before = _strip_tags(fragment[pos : m.start()])
        if before:
            out.append((before, None))
        base = _html.unescape(m.group(1)).strip()
        read = _html.unescape(m.group(2)).strip()
        if base:
            out.append((base, read or None))
        pos = m.end()
    tail = _strip_tags(fragment[pos:])
    if tail:
        out.append((tail, None))
    # 清掉純空白 token
    return [(t, r) for t, r in out if t.strip() or r]


def tokens_display(tokens: list[tuple[str, str | None]]) -> str:
    """由 token 重建 display HTML（全 escape，只產生 ruby/rt）——防注入。"""
    parts = []
    for t, r in tokens:
        if r:
            parts.append(f"<ruby>{_html.escape(t)}<rt>{_html.escape(r)}</rt></ruby>")
        else:
            parts.append(_html.escape(t))
    return "".join(parts)


def tokens_read(tokens: list[tuple[str, str | None]]) -> str:
    """token → 純讀音（有 ruby 用讀音、否則原文），TTS 用。"""
    return "".join((r if r else t) for t, r in tokens).strip()


def split_sentences(tokens: list[tuple[str, str | None]]) -> list[list[tuple[str, str | None]]]:
    """依「。」切句（句號留在句尾）。ruby token 不會被切開。"""
    lines: list[list[tuple[str, str | None]]] = []
    cur: list[tuple[str, str | None]] = []
    for t, r in tokens:
        if r is not None or "。" not in t:
            cur.append((t, r))
            continue
        pieces = t.split("。")
        for i, piece in enumerate(pieces[:-1]):
            cur.append((piece + "。", None))
            lines.append(cur)
            cur = []
        if pieces[-1]:
            cur.append((pieces[-1], None))
    if cur and tokens_read(cur):
        lines.append(cur)
    return lines


def parse_article(html: str) -> dict:
    """
    NHK Easy 文章頁 → {title, title_read, lines: [{jp, read}]}。
    jp 是含 ruby 的 display HTML（token 重建、安全），read 是純讀音。
    """
    tm = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    title_tokens = tokenize(tm.group(1)) if tm else []

    bm = re.search(
        r'<div[^>]*(?:id="js-article-body"|class="[^"]*article-body[^"]*")[^>]*>(.*?)</div>',
        html,
        re.S,
    )
    body = bm.group(1) if bm else ""
    lines: list[dict] = []
    for pm in re.finditer(r"<p[^>]*>(.*?)</p>", body, re.S):
        toks = tokenize(pm.group(1))
        for sent in split_sentences(toks):
            read = tokens_read(sent)
            if not read:
                continue
            lines.append({"jp": tokens_display(sent), "read": read})
    return {
        "title": tokens_display(title_tokens),
        "title_read": tokens_read(title_tokens),
        "lines": lines,
    }
