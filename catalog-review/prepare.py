"""Prepare actual, size-capped WebP posters and preflight source launches."""
import concurrent.futures
import io
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS = 40000000
manifest = json.loads(Path("catalog-review/input.json").read_text())
posters = Path("catalog-review/posters")
posters.mkdir(exist_ok=True)

def prepare(item):
    slug, assets = item
    result = {}
    try:
        with urlopen(Request(assets["url"], headers={"User-Agent": "Unlocked-art-import/1"}), timeout=15) as response:
            data = response.read(12_000_001)
        if len(data) > 12_000_000:
            raise ValueError("image too large")
        image = Image.open(io.BytesIO(data))
        image.load()
        if min(image.size) < 80:
            raise ValueError("image too small")
        image = ImageOps.exif_transpose(image).convert("RGBA")
        matte = Image.new("RGB", image.size, "#171b29")
        matte.paste(image, mask=image.getchannel("A"))
        # Preserve title marks and box art. Fit landscape artwork over its own darkened background.
        backdrop = ImageOps.fit(matte, (320, 480))
        if matte.width / matte.height > 0.9:
            from PIL import ImageFilter, ImageEnhance
            backdrop = ImageEnhance.Brightness(backdrop.filter(ImageFilter.GaussianBlur(14))).enhance(0.46)
            face = ImageOps.contain(matte, (320, 480))
            backdrop.paste(face, ((320-face.width)//2, (480-face.height)//2))
        backdrop.save(posters / (slug + ".webp"), "WEBP", quality=84)
        result["art"] = True
    except Exception as error:
        result["imageError"] = str(error)[:160]
    if assets.get("launch") and result.get("art"):
        try:
            with urlopen(Request(assets["launch"],headers={"User-Agent":"Mozilla/5.0","Range":"bytes=0-65535"}),timeout=12) as response:
                body = response.read(65536).lower()
                xfo = response.headers.get("X-Frame-Options", "").lower()
                csp = response.headers.get("Content-Security-Policy", "").lower()
                if "html" not in response.headers.get("Content-Type", "").lower() or not (b"<html" in body or b"<script" in body or b"<!doctype" in body):
                    raise ValueError("no HTML response")
                if "deny" in xfo or "sameorigin" in xfo or "frame-ancestors 'none'" in csp or "frame-ancestors 'self'" in csp:
                    raise ValueError("embedding blocked")
            result["launch"] = True
        except Exception as error:
            result["launchError"] = str(error)[:160]
    return slug,result

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    results = dict(pool.map(prepare, manifest.items()))
Path("catalog-review/result.json").write_text(json.dumps(results, indent=2)+"\n")
print("Decoded",sum(bool(r.get("art")) for r in results.values()),"of",len(results),"previews")
