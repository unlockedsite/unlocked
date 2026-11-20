import json
from urllib.request import Request,urlopen
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
service='https://unlocked-arcade-service.persistingthoughts0.chatgpt.site'
origin='https://unlockedsite.github.io'
def get(path,post=False):
    r=urlopen(Request(service+path,data=b'{}' if post else None,headers={'Origin':origin,'Content-Type':'application/json'}),timeout=25)
    assert r.headers.get('Access-Control-Allow-Origin')==origin
    return json.load(r)
print('Arcade health',get('/v1/health'))
print('Local 2048 launch',get('/v1/launch/2048',True)['url'])
assert 'plays' in get('/v1/top')
def probe(item):
    with urlopen(Request(item['url'],headers={'Range':'bytes=0-65535'}),timeout=20) as r:
        assert 'html' in r.headers.get('Content-Type','').lower()
        assert r.headers.get('X-Frame-Options','').lower() not in ('deny','sameorigin')
        body=r.read(65536).lower()
        assert b'<script' in body and (b'<html' in body or b'<canvas' in body)
        print('Checked source build',item['id'])
with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(probe,json.loads(Path('catalog-review/pages-builds.json').read_text())))
