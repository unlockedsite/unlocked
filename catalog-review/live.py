from playwright.sync_api import sync_playwright
from urllib.parse import urlparse
from time import time
base='https://unlockedsite.github.io/unlocked/'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    page=browser.new_page(user_agent='Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/144.0.0.0 Safari/537.36')
    page.add_init_script("Object.defineProperty(navigator,'userAgentData',{value:undefined})")
    page.goto(base+'?release='+str(int(time()))+'#/game/2048',wait_until='domcontentloaded')
    page.get_by_role('button',name='Play game',exact=True).click(timeout=30000)
    tiles=page.frame_locator('#stage iframe').locator('.tile-container')
    tiles.locator('.tile').first.wait_for(timeout=10000)
    before=tiles.inner_html()
    for key in ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp']:
        page.keyboard.press(key)
        page.wait_for_timeout(120)
    assert before!=tiles.inner_html()
    page.get_by_role('button',name='Fullscreen',exact=True).click()
    page.wait_for_function("document.fullscreenElement?.id==='stage'")
    page.get_by_role('button',name='Leave fullscreen').click()
    page.wait_for_function("!document.fullscreenElement")
    print('Verified live 2048 launch, keyboard controls and native fullscreen')
    counts=page.evaluate("""async () => {
      const games=await (await fetch('./games.json?v=4')).json();
      const posters=await fetch('./assets/posters/2048.webp');
      const bitmap=await createImageBitmap(await posters.blob());
      let community;
      try {const r=await fetch('https://unlocked-arcade-service.persistingthoughts0.chatgpt.site/v1/health',{signal:AbortSignal.timeout(7000)});community={status:r.status,body:(await r.text()).slice(0,140)}}catch(e){community={error:e.message}}
      return [games.length,games.filter(g=>g.mode==='embed').length,bitmap.width,bitmap.height,community];
    }""")
    print('Published catalog and public service',counts)
    assert counts[:4]==[350,218,320,480],counts
    browser.close()
