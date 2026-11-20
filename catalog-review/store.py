import json, re, time, unicodedata
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from PIL import Image, ImageOps
base = Path('catalog-review')
def fetch(url, limit):
    with urlopen(Request(url,headers={'User-Agent':'Unlocked-arcade-catalog/1.0'}),timeout=9) as r:
        return r.read(limit)
def norm(t):
    t = unicodedata.normalize('NFKD',t).casefold().replace('&','and')
    return ''.join(c for c in t if c.isalnum())
def cover(item):
    slug, g = item
    time.sleep(0.3)
    try:
        q = urlencode({'term':g['title'],'l':'english','cc':'US'})
        products = json.loads(fetch('https://store.steampowered.com/api/storesearch/?'+q,300000))['items']
        hit = next(p for p in products if norm(p['name']) == norm(g['title']) and p.get('type')=='app')
        app = int(hit['id'])
        if b'<html' not in fetch(g['launch'],65536).lower() and b'<script' not in fetch(g['launch'],65536).lower():
            return None
        for url in (f'https://cdn.cloudflare.steamstatic.com/steam/apps/{app}/library_600x900_2x.jpg',hit['tiny_image']):
            try:
                image=Image.open(BytesIO(fetch(url,8000000))).convert('RGB')
                if min(image.size)<80:continue
                poster=ImageOps.fit(image,(320,480))
                if image.width>image.height:
                    from PIL import ImageEnhance,ImageFilter
                    poster=ImageEnhance.Brightness(poster.filter(ImageFilter.GaussianBlur(14))).enhance(0.45)
                    face=ImageOps.contain(image,(320,480))
                    poster.paste(face,((320-face.width)//2,(480-face.height)//2))
                poster.save(base/'posters'/(slug+'.webp'),'WEBP',quality=85)
                return slug,{'source':f'https://store.steampowered.com/app/{app}/','art':True,'launch':True}
            except Exception:continue
    except Exception:return None
items=json.loads((base/'store-input.json').read_text())
with ThreadPoolExecutor(max_workers=2) as pool:
    found=dict(x for x in pool.map(cover,items.items()) if x)
(base/'store-result.json').write_text(json.dumps(found,indent=2)+'\n')
print('Verified store artwork for',len(found),'additional browser builds')
