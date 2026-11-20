from playwright.sync_api import sync_playwright
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from PIL import Image
import json,io
root=Path('docs').resolve()
class Static(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Static,directory=str(root)))
Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':320,'height':480})
 page.goto(base+'/imports/2048/');page.wait_for_selector('.tile')
 for key in ['ArrowDown','ArrowLeft','ArrowUp','ArrowLeft','ArrowRight','ArrowDown']*4:page.keyboard.press(key);page.wait_for_timeout(65)
 page.wait_for_timeout(200);(root/'assets/posters').mkdir(exist_ok=True)
 pic=Image.open(io.BytesIO(page.screenshot()));pic.save(root/'assets/posters/2048.webp','WEBP',quality=86)
 page.close()
 for machine in ['CrOS x86_64 14541.0.0','X11; Linux x86_64']:
  page=browser.new_page(user_agent='Mozilla/5.0 ('+machine+') AppleWebKit/537.36 Chrome/144.0.0.0 Safari/537.36',viewport={'width':1366,'height':768})
  page.add_init_script("Object.defineProperty(navigator,'userAgentData',{value:undefined})")
  errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
  def mock(route):
   url=route.request.url
   response={'plays':{},'active':{}} if '/top' in url else {'url':base+'/imports/2048/'} if '/launch/' in url else {'recorded':True}
   route.fulfill(json=response,headers={'Access-Control-Allow-Origin':'*'})
  page.route('https://unlocked-arcade-service.persistingthoughts0.chatgpt.site/**',mock)
  page.on('console',lambda msg:print("browser",msg.type,msg.text[:300]) if msg.type=="error" else None)
  page.goto(base+'/#/game/2048');page.wait_for_selector('#stage');page.wait_for_timeout(350);print("startbox",page.locator('#startbox').inner_text(),errs)
  page.get_by_role('button',name='Play game').click(timeout=6000)
  frame=page.frame_locator('iframe');frame.locator('.tile').first.wait_for()
  page.evaluate('window.originalFrame=document.querySelector("iframe")')
  old=frame.locator('.tile-container').inner_html()
  for key in ['ArrowDown','ArrowRight','ArrowDown','ArrowLeft']:page.keyboard.press(key);page.wait_for_timeout(120)
  assert old!=frame.locator('.tile-container').inner_html()
  before=page.locator('iframe').evaluate('(f)=>[f.offsetWidth,f.offsetHeight]')
  page.get_by_role('button',name='Fullscreen',exact=True).click()
  page.wait_for_function('document.fullscreenElement?.id==="stage"')
  after=page.locator('iframe').evaluate('(f)=>[f.offsetWidth,f.offsetHeight]')
  if 'CrOS' in machine:assert before==after,(before,after)
  assert page.evaluate('document.activeElement===originalFrame')
  page.get_by_role('button',name='Leave fullscreen').click()
  page.wait_for_function('!document.fullscreenElement')
  assert page.evaluate('document.querySelector("iframe")===originalFrame')
  page.evaluate('document.getElementById("stage").requestFullscreen=()=>Promise.reject(new Error("denied"))')
  page.get_by_role('button',name='Fullscreen',exact=True).click()
  page.wait_for_function('document.getElementById("toast").textContent.includes("blocked")')
  assert not page.evaluate('!!document.fullscreenElement')
  print(machine,'native fullscreen entry/exit, iframe identity, keyboard input, denial feedback passed',before,after)
  page.goto(base+'/#/library');page.locator('.card').first.wait_for();assert page.locator('.card').count()==48
  page.get_by_role('button',name='Show more games').click();assert page.locator('.card').count()==96
  page.fill('#search','Grand Theft Auto III');page.wait_for_timeout(200)
  assert not errs,errs
  page.close()
 browser.close()
server.shutdown()
