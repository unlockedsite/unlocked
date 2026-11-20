import json
from urllib.request import Request,urlopen
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
service='https://unlocked-arcade-service.persistingthoughts0.chatgpt.site'
origin='https://unlockedsite.github.io'
def get(path,post=False):
    r=urlopen(Request(service+path,data=b'{}' if post else None,headers={'Origin':origin,'Content-Type':'application/json','User-Agent':'Mozilla/5.0'}),timeout=25)
    assert r.headers.get('Access-Control-Allow-Origin')==origin
    return json.load(r)
try:
    print('Arcade health',get('/v1/health'))
    print('Local 2048 launch',get('/v1/launch/2048',True)['url'])
except Exception as e:
    print('Service from this runner',e)
    if hasattr(e,'read'):print('Gateway response',e.read(300).decode(errors='replace'))
def probe(item):
    with urlopen(Request(item['url'],headers={'Range':'bytes=0-65535','User-Agent':'Mozilla/5.0'}),timeout=20) as r:
        assert 'html' in r.headers.get('Content-Type','').lower()
        assert r.headers.get('X-Frame-Options','').lower() not in ('deny','sameorigin')
        body=r.read(65536).lower()
        assert b'<script' in body and (b'<html' in body or b'<canvas' in body)
        print('Checked source build',item['id'])
failed=[]
for b in json.loads(Path('catalog-review/pages-builds.json').read_text()):
    try:probe(b)
    except Exception as e:
        print('Source check failed',b['id'],e)
        failed.append(b['id'])
assert not failed, failed
