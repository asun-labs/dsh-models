"""同步 SAVAGE 公开模型目录，不下载模型和纹理文件。"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from hashlib import sha256
from pathlib import Path
import time
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = "https://savage.nps.edu/Savage/"
CACHE_DIR = None


def official_url(base, value):
    url = urljoin(base, value)
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.netloc != "savage.nps.edu" or not parts.path.startswith("/Savage/"):
        raise ValueError(f"非 SAVAGE 资源链接：{url}")
    return url


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.rows = []
        self.row = None
        self.cell = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "tr":
            self.row = {"links": [], "images": [], "cells": []}
        if tag == "td" and self.row is not None:
            self.cell = []
        if tag == "a" and "href" in attrs:
            self.links.append(attrs["href"])
            if self.row is not None:
                self.row["links"].append(attrs["href"])
        if tag == "img" and self.row is not None:
            self.row["images"].append(attrs)

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None and self.row is not None:
            self.row["cells"].append(" ".join("".join(self.cell).split()))
            self.cell = None
        if tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None
            self.cell = None


def fetch(url):
    cache = CACHE_DIR / (sha256(url.encode()).hexdigest() + '.html') if CACHE_DIR else None
    if cache and cache.exists():
        return Page(cache.read_text(encoding='utf-8'))
    error_cache = cache.with_suffix('.error.json') if cache else None
    if error_cache and error_cache.exists():
        status = json.loads(error_cache.read_text(encoding='utf-8'))['status']
        raise HTTPError(url, status, '来源详情不可访问', {}, None)
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": "dsh-models-catalog/0.1 (SAVAGE public catalog index)"})
            with urlopen(request, timeout=30) as response:
                text = response.read(8 * 1024 * 1024).decode("utf-8-sig")
                if cache:
                    cache.write_text(text, encoding='utf-8')
                return Page(text)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def directory(url):
    page = fetch(url)
    entries = []
    for row in page.rows:
        links = [value for value in row["links"] if "/" not in value and value.endswith("Index.html")]
        images = [image for image in row["images"] if image.get("src", "").startswith("_thumbnails/")]
        if not links:
            continue
        image = images[0] if images else {}
        source = official_url(url, links[0])
        path = urlsplit(source).path.removeprefix("/Savage/")
        entries.append({
            "id": path.removesuffix("Index.html"),
            "name": row["cells"][1] or image.get("alt", ""),
            "description": row["cells"][-1],
            "category": path.split("/")[0],
            "sourceDirectory": path.split("/")[-2],
            "sourcePage": source,
            "thumbnailUrl": official_url(url, image["src"]) if image.get('src') else None,
        })
    return entries


def detail(entry):
    try:
        page = fetch(entry["sourcePage"])
    except HTTPError as error:
        if error.code not in (403, 404):
            raise
        entry.update(modelUrl=None, format='X3D', licenseUrl=ROOT + 'license.html',
                     downloadUnavailable=f'来源详情返回 HTTP {error.code}')
        return entry
    links = [official_url(entry["sourcePage"], value) for value in page.links
             if urlsplit(value).path.endswith(".x3d") and not urlsplit(value).query
             and urlsplit(urljoin(entry['sourcePage'], value)).netloc == 'savage.nps.edu']
    if not links:
        raise ValueError(f"详情页没有 X3D 下载链接：{entry['sourcePage']}")
    entry["modelUrl"] = links[0]
    entry["format"] = "X3D"
    entry["licenseUrl"] = ROOT + "license.html"
    # 此图已实际解码核验为单色，不能当作模型截图。
    if entry["id"] == "ShipsMilitary/CarrierNimitzUnitedStates/NimitzCVN":
        entry["thumbnailUrl"] = None
    return entry


def main():
    global CACHE_DIR
    parser = argparse.ArgumentParser(description="从 SAVAGE 同步模型分类、预览图和下载链接。失败时保留旧快照。",
                                     epilog="示例：py -3 scripts/sync-savage.py")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "src/savage-catalog.json",
                        help="目录快照输出路径")
    parser.add_argument('--cache-dir', type=Path, help='可选：复用本次采集的页面缓存以继续中断的同步；全量刷新时省略')
    args = parser.parse_args()
    CACHE_DIR = args.cache_dir
    if CACHE_DIR:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
    page = fetch(ROOT)
    directories = sorted({official_url(ROOT, value) for value in page.links
                          if len(value.split("/")) == 3 and value.endswith("/index.html") and not value.startswith(".")})
    if not directories:
        raise ValueError("总目录未识别到分类目录，请检查官方页面结构。")
    print(f"正在读取 {len(directories)} 个分类目录…", flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        entries = {entry["id"]: entry for rows in pool.map(directory, directories) for entry in rows}
        expected = {official_url(ROOT, value) for value in page.links if value.endswith('Index.html')}
        actual = {entry['sourcePage'] for entry in entries.values()}
        if expected != actual:
            raise ValueError(f'分类行与总目录不一致：缺少 {len(expected - actual)} 条，额外 {len(actual - expected)} 条')
        print(f'正在核验 {len(entries)} 个模型详情页…', flush=True)
        models = []
        for entry in pool.map(detail, sorted(entries.values(), key=lambda row: row["id"])):
            models.append(entry)
            if len(models) % 100 == 0:
                print(f"已核验 {len(models)}/{len(entries)} 个详情页", flush=True)
    if not models:
        raise ValueError("未采集到模型，拒绝覆盖快照。")
    snapshot = {"source": "NPS SAVAGE", "sourceUrl": ROOT,
                "indexedAt": datetime.now(timezone.utc).isoformat(), "models": models}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(f"已保存 {len(models)} 条模型索引：{args.output}")


if __name__ == "__main__":
    main()
