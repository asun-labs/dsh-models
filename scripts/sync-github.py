"""生成 GitHub 三维资产索引；不在运行时爬站，不分发模型文件。"""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPOS = {
    'nasa': ('nasa/NASA-3D-Resources', '11ebb4ee043715aefbba6aeec8a61746fad67fa7'),
    'openhome': ('yuyou-dev/OpenHome3D', 'cb52afc00201b4b7ed90b24631e977112ba07869'),
    'khronos': ('KhronosGroup/glTF-Sample-Assets', 'e124e8d8d7330a5372bc2b4d00d39a4a9d7997ea'),
}
KAT = {
    'BoomBox': ('devices', 'audio'), 'CommercialRefrigerator': ('devices', 'appliances'),
    'GlamVelvetSofa': ('home', 'seating'), 'SheenChair': ('home', 'seating'),
    'SheenWoodLeatherSofa': ('home', 'seating'), 'SpecularSilkPouf': ('home', 'seating'),
    'ChairDamaskPurplegold': ('home', 'seating'), 'Lantern': ('devices', 'lighting'),
    'ChronographWatch': ('devices', 'instruments'), 'Avocado': ('misc', 'food'),
    'Fox': ('misc', 'animals'), 'Duck': ('misc', 'animals'), 'BarramundiFish': ('misc', 'animals'),
    'WaterBottle': ('misc', 'props'), 'TrafficCone': ('misc', 'props'),
    'ABeautifulGame': ('misc', 'props'), 'ToyCar': ('misc', 'props'),
}


def raw(repo, commit, path):
    return f'https://raw.githubusercontent.com/{repo}/{commit}/' + urllib.parse.quote(path, safe='/')


def page(repo, commit, path):
    return f'https://github.com/{repo}/blob/{commit}/' + urllib.parse.quote(path, safe='/')


def read_url(url, cache):
    import hashlib
    target = cache / hashlib.sha256(url.encode()).hexdigest()
    if target.exists():
        return target.read_bytes()
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'dsh-models-source-index/1.0'})
            with urllib.request.urlopen(request, timeout=45) as response:
                body = response.read()
            target.write_bytes(body)
            return body
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def classify_home(name):
    text = name.lower()
    if any(word in text for word in ['computer', 'laptop', 'television', 'speaker', 'radio']):
        return 'devices', 'electronics'
    if any(word in text for word in ['stove', 'oven', 'microwave', 'toaster', 'coffeemachine', 'blender', 'fridge', 'washer', 'dryer', 'hood', 'fan']):
        return 'devices', 'appliances'
    if any(word in text for word in ['knife', 'fork', 'spoon', 'pan-', 'pot-', 'cuttingboard', 'cutting-board']):
        return 'devices', 'tools'
    if any(word in text for word in ['chair', 'couch', 'sofa', 'bench', 'stool', 'pouf']):
        return 'home', 'seating'
    if 'bed' in text and 'cabinet' not in text:
        return 'home', 'beds'
    if any(word in text for word in ['cabinet', 'shelf', 'bookcase', 'rack', 'counter']):
        return 'home', 'storage'
    if any(word in text for word in ['table', 'desk']):
        return 'home', 'tables'
    if 'lamp' in text:
        return 'home', 'lighting'
    if any(word in text for word in ['wall', 'floor', 'stairs', 'doorway', 'paneling']):
        return 'home', 'structure'
    if any(word in text for word in ['bath', 'toilet', 'sink', 'shower']):
        return 'home', 'bathroom'
    return 'home', 'decor'


def classify_nasa(name):
    name = name.lower()
    if any(word in name for word in ['rover', 'lander', 'lunar module']):
        return 'space-rovers'
    if any(word in name for word in ['rocket', 'shuttle', 'sls', 'saturn v', 'atlas v']):
        return 'space-launchers'
    if any(word in name for word in ['station', 'suit', 'astronaut', 'capsule', 'crew']):
        return 'space-crewed'
    if any(word in name for word in ['satellite', 'orbiter', 'observing', 'probe', 'telescope']):
        return 'spacecraft'
    if name in ['moon', 'earth', 'mars', 'venus', 'jupiter', 'saturn', 'mercury', 'neptune', 'pluto', 'uranus'] or any(word in name for word in ['asteroid', 'mars surface', 'terrain', 'crater']):
        return 'space-environments'
    return 'spacecraft'


def build(cache):
    models, sources, evidence = [], {}, {}
    trees = {}
    for key, (repo, commit) in REPOS.items():
        document = json.loads(read_url(f'https://api.github.com/repos/{repo}/git/trees/{commit}?recursive=1', cache))
        if document.get('truncated') or document['sha'] != commit:
            raise ValueError(f'{repo}: tree 不完整或版本不一致')
        trees[key] = {entry['path']: entry for entry in document['tree'] if entry['type'] == 'blob'}
    nasa_repo, nasa_sha = REPOS['nasa']
    nasa_license = 'https://www.nasa.gov/nasa-brand-center/images-and-media/'
    sources['nasa'] = {'id': 'nasa', 'name': 'NASA 3D Resources', 'url': f'https://github.com/{nasa_repo}', 'commit': nasa_sha,
                       'licenseNote': '遵守 NASA 媒体使用规范；核对单项署名及第三方权利，不暗示 NASA 背书。'}
    evidence['NASA-README.md'] = read_url(raw(nasa_repo, nasa_sha, 'README.md'), cache)
    for path, entry in trees['nasa'].items():
        if not path.startswith('3D Models/') or not path.lower().endswith('.glb'):
            continue
        directory = str(pathlib.PurePosixPath(path).parent)
        images = [p for p in trees['nasa'] if str(pathlib.PurePosixPath(p).parent) == directory and p.lower().endswith(('.png', '.jpg'))]
        title = pathlib.PurePosixPath(directory).name
        model_name = pathlib.PurePosixPath(path).stem
        identifier = re.sub(r'[^a-zA-Z0-9_-]', '_', model_name) + '-' + hashlib.sha256(path.encode()).hexdigest()[:8]
        models.append({'id': 'nasa/' + identifier, 'name': model_name, 'domain': 'equipment', 'category': classify_nasa(title),
                       'sourceId': 'nasa', 'sourceDirectory': directory, 'format': 'GLB', 'modelUrl': raw(nasa_repo, nasa_sha, path),
                       'sourcePage': page(nasa_repo, nasa_sha, path), 'thumbnailUrl': raw(nasa_repo, nasa_sha, images[0]) if images else None,
                       'description': 'NASA 航天与科学资源 · 原始 GLB；具体模型信息及贡献者见来源页。', 'bytes': entry.get('size'),
                       'license': 'NASA 使用规范', 'licenseUrl': nasa_license, 'author': 'NASA 与各模型贡献者（见来源）',
                       'attribution': 'NASA 3D Resources; see model source and NASA media usage guidelines.',
                       'usageNotes': sources['nasa']['licenseNote'], 'sourceCommit': nasa_sha})
    repo, commit = REPOS['openhome']
    packs = [('kenney', 'Kenney 家具与设备', 'Kenney', 'https://kenney.nl/assets/furniture-kit'),
             ('kaykit-furniture', 'KayKit 家具', 'Kay Lousberg', 'https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0'),
             ('kaykit-restaurant', 'KayKit 餐厅', 'Kay Lousberg', 'https://kaylousberg.itch.io/restaurant-bits')]
    for pack, label, author, original in packs:
        prefix = 'public/models/' + pack + '/'
        license_path = prefix + 'LICENSE.txt'
        license_body = read_url(raw(repo, commit, license_path), cache)
        if b'CC0' not in license_body:
            raise ValueError('资源包未证实为 CC0: ' + pack)
        evidence[pack + '-LICENSE.txt'] = license_body
        sources[pack] = {'id': pack, 'name': label, 'url': original, 'mirrorUrl': f'https://github.com/{repo}', 'commit': commit,
                         'licenseNote': 'CC0 1.0；GLB 由 OpenHome3D 镜像提供，许可证据取自资产包目录，不使用应用代码许可。'}
        for path, entry in trees['openhome'].items():
            if not path.startswith(prefix) or not path.endswith('.glb'):
                continue
            stem = pathlib.PurePosixPath(path).stem
            domain, category = classify_home(stem)
            title = re.sub(r'([a-z])([A-Z])', r'\1 \2', stem).replace('-', ' ').replace('_', ' ')
            models.append({'id': pack + '/' + stem, 'name': title, 'domain': domain, 'category': category, 'sourceId': pack,
                           'description': f'{label} · {author} 制作 · OpenHome3D GLB 镜像。', 'sourceDirectory': pack, 'format': 'GLB',
                           'modelUrl': raw(repo, commit, path), 'sourcePage': page(repo, commit, path), 'originalSourceUrl': original,
                           'thumbnailUrl': None, 'bytes': entry.get('size'), 'license': 'CC0-1.0',
                           'licenseUrl': page(repo, commit, license_path), 'author': author, 'attribution': f'{label} by {author}; GLB mirror: {repo}.',
                           'usageNotes': 'CC0：可商用、修改；无需强制署名，建议保留来源。', 'sourceCommit': commit})
    repo, commit = REPOS['khronos']
    sources['khronos'] = {'id': 'khronos', 'name': 'Khronos glTF 资源', 'url': f'https://github.com/{repo}', 'commit': commit,
                          'licenseNote': '逐项许可；本索引仅接入全部权利项均为 CC0 或 CC BY 4.0 的精选 GLB。'}

    def khronos(item):
        name, (domain, category) = item
        prefix = f'Models/{name}/'
        meta = json.loads(read_url(raw(repo, commit, prefix + 'metadata.json'), cache))
        legal = meta.get('legal', [])
        if not legal or any(part.get('spdx') not in ['CC0-1.0', 'CC-BY-4.0'] for part in legal):
            return None
        path = prefix + 'glTF-Binary/' + name + '.glb'
        if path not in trees['khronos']:
            return None
        image = prefix + meta['screenshot']
        if image not in trees['khronos']:
            raise ValueError('截图不存在: ' + image)
        evidence[name + '-metadata.json'] = json.dumps(meta, ensure_ascii=False, indent=2).encode()
        evidence[name + '-README.md'] = read_url(raw(repo, commit, prefix + 'README.md'), cache)
        license_name = ' / '.join(dict.fromkeys(part['spdx'] for part in legal))
        return {'id': 'khronos/' + name, 'name': meta['name'], 'domain': domain, 'category': category, 'sourceId': 'khronos',
                'description': meta.get('summary', ''), 'sourceDirectory': name, 'format': 'GLB', 'modelUrl': raw(repo, commit, path),
                'sourcePage': page(repo, commit, prefix + 'README.md'), 'thumbnailUrl': raw(repo, commit, image), 'bytes': trees['khronos'][path].get('size'),
                'license': license_name, 'licenseUrl': page(repo, commit, prefix + 'README.md'), 'author': ' / '.join(dict.fromkeys(p['artist'] for p in legal)),
                'attribution': '\n'.join(f"{p['year']} {p['owner']}; {p['artist']} — {p['what']}; {p['spdx']} {p['licenseUrl']}" for p in legal),
                'usageNotes': '含 CC BY 项时须署名、附许可链接并说明修改；原始详细归属见来源页。' if 'CC-BY' in license_name else 'CC0：可商用、修改；建议保留来源。',
                'sourceCommit': commit}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        models.extend(model for model in pool.map(khronos, KAT.items()) if model)
    if len({m['id'] for m in models}) != len(models):
        raise ValueError('资产 ID 重复')
    return {'indexedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sources': sources, 'models': models}, evidence


def main():
    parser = argparse.ArgumentParser(description='从固定 GitHub commit 生成资产索引与逐项许可证据。示例：py -3 scripts/sync-github.py --cache-dir .build/github-cache')
    parser.add_argument('--cache-dir', type=pathlib.Path, default=ROOT / '.build/github-cache')
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'src/github-catalog.json')
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    snapshot, evidence = build(args.cache_dir)
    destination = ROOT / 'third-party/github'
    destination.mkdir(parents=True, exist_ok=True)
    for name, data in evidence.items():
        (destination / name).write_bytes(data)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    temporary.replace(args.output)
    print(f'索引已生成：{len(snapshot["models"])} 项 GitHub 资产，{len(snapshot["sources"])} 个来源；证据 {len(evidence)} 份。')


if __name__ == '__main__':
    main()
