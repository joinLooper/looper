import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../..');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
assert.equal(hash(resolve(dir, 'scene.png')), hash(resolve(dir, '../w1c1-b-vis-lv1-hf-02/lv1-forest-clearing-scene-canon-v2.png')));
const browser = await puppeteer.launch({ headless: true, ...(process.env.LOOPER_CAPTURE_BROWSER_EXECUTABLE ? { executablePath: process.env.LOOPER_CAPTURE_BROWSER_EXECUTABLE } : {}) });
const result = { status: 'PASS', scope: 'local visual HTML only; no App API or art approval', sceneUnchanged: true, viewports: [], canon: [], privateComparison: null };
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const ready = async () => { await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode())); }); };
  for (const [name, width, height] of [['9x16', 360, 640], ['9x19_5', 390, 845]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(pathToFileURL(resolve(dir, 'index.html')).href);
    await ready();
    const geometry = await page.evaluate(() => {
      const rect = element => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom }; };
      const phone = document.querySelector('.phone');
      const stage = document.querySelector('.stage');
      return { phone:rect(phone), stage:rect(stage), canopy:rect(document.querySelector('.canopy')), viewport:{width:innerWidth,height:innerHeight}, overflow:document.documentElement.scrollWidth > innerWidth, hotspots:[...document.querySelectorAll('.hotspot')].map(el => { const r=rect(el); return { ...r, label:el.getAttribute('aria-label'), message:el.dataset.message, border:getComputedStyle(el).borderTopWidth, background:getComputedStyle(el).backgroundColor, hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.hotspot')===el }; }) };
    });
    assert.equal(geometry.phone.height, height);
    assert.equal(geometry.phone.width, width);
    assert.equal(geometry.overflow, false);
    assert.ok(Math.abs(geometry.stage.width / geometry.stage.height - 941/1672) < .00001);
    assert.ok(Math.abs(geometry.canopy.bottom - (geometry.stage.y + geometry.stage.height*.34)) < 1);
    assert.ok(Math.abs(geometry.stage.bottom-height)<1);
    assert.equal(geometry.hotspots.length, 3);
    for (const hotspot of geometry.hotspots) {
      assert.ok(hotspot.width>=48 && hotspot.height>=48 && hotspot.hit);
      assert.ok(hotspot.x>=0 && hotspot.y>=0 && hotspot.x+hotspot.width<=width+.1 && hotspot.bottom<=height);
      assert.equal(hotspot.border, '0px');
      assert.equal(hotspot.background, 'rgba(0, 0, 0, 0)');
    }
    // All anchor pixels below 34% retain full-width source mapping, including the existing left-edge stump.
    for (const [label,x,y] of [['face',.43,.465],['stump',.10,.67],['sprout',.84,.66]]) {
      const point={x:x*width,y:geometry.stage.y+y*geometry.stage.height};
      assert.ok(point.x>=0 && point.x<=width && point.y>=0 && point.y<=height,label);
    }
    await page.screenshot({path:resolve(dir,`phone-${name}.png`)});
    if(name==='9x16') await page.screenshot({path:resolve(dir,'hud.png')});
    for (const selector of ['.stump','.marmot','.sprout']) {
      await page.tap(selector);
      const state=await page.evaluate(selector=>({actual:document.querySelector('.notice').textContent,expected:document.querySelector(selector).dataset.message,visible:document.querySelector('.notice').classList.contains('visible')}),selector);
      assert.equal(state.actual,state.expected); assert.ok(state.visible);
    }
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.notice')).opacity==='1');
    await page.screenshot({path:resolve(dir,`phone-${name}-feedback.png`)});
    await page.waitForFunction(()=>!document.querySelector('.notice').classList.contains('visible'),{timeout:5000});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.tap('.marmot');
    const reduced=await page.$eval('.marmot .marker',el=>getComputedStyle(el).animationName);
    assert.equal(reduced,'none');
    await page.screenshot({path:resolve(dir,`phone-${name}-reduced-motion.png`)});
    await page.emulateMediaFeatures([]);
    result.viewports.push({name,width,height,geometry,reducedMotion:'PASS',touch:'3/3',noticeDismissal:'PASS'});
  }
  // Keyboard operation and safe-area emulation are checked independently from touch.
  await page.goto(pathToFileURL(resolve(dir,'index.html')).href); await ready();
  await page.keyboard.press('Tab');
  assert.equal(await page.$eval(':focus',el=>el.classList.contains('stump')),true);
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('.notice',el=>el.textContent),'在樹樁旁，留一點安靜的時間。');
  await page.addStyleTag({content:'.topbar{top:69px}.hint{bottom:59px}.notice{bottom:100px}'});
  const safe=await page.evaluate(()=>({header:document.querySelector('.topbar').getBoundingClientRect().top,hint:innerHeight-document.querySelector('.hint').getBoundingClientRect().bottom}));
  assert.ok(safe.header>=47 && safe.hint>=34); result.safeArea={mode:'CSS emulated 47px top / 34px bottom; physical device not tested',...safe};
  await page.setViewport({width:1100,height:1100,deviceScaleFactor:1,isMobile:false});
  await page.goto(pathToFileURL(resolve(dir,'comparison.html')).href); await ready();
  await page.screenshot({path:resolve(dir,'hf02-vs-hf02_1.png'),fullPage:true});
  if(process.env.LOOPER_CANON_REFERENCE_DIR) {
    const canon=process.env.LOOPER_CANON_REFERENCE_DIR;
    const manifest=JSON.parse(readFileSync(resolve(canon,'MANIFEST_SHA256.json'),'utf8'));
    assert.equal(manifest.files.length,3);
    for(const file of manifest.files) { assert.equal(hash(resolve(canon,file.name)),file.sha256); result.canon.push({name:file.name,sha256:file.sha256,verified:true}); }
    await page.goto(pathToFileURL(resolve(dir,'canon-review.html')).href);
    await (await page.$('#files')).uploadFile(...manifest.files.map(file=>resolve(canon,file.name)));
    await ready();
    const dimensions=await page.$$eval('#references img',images=>images.map(img=>[img.naturalWidth,img.naturalHeight]));
    assert.deepEqual(dimensions,manifest.files.map(file=>file.dimensions));
    const privateDir=resolve(root,'output/vis-lv1-hf-02-1'); mkdirSync(privateDir,{recursive:true});
    await page.screenshot({path:resolve(privateDir,'private-canon-comparison.png'),fullPage:true});
    result.privateComparison='output/vis-lv1-hf-02-1/private-canon-comparison.png (gitignored; never publish)';
  }
  assert.deepEqual(errors,[]); result.pageErrors=errors;
  writeFileSync(resolve(dir,'BROWSER_QA.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,viewports:result.viewports.map(x=>x.name),canonVerified:result.canon.length,privateComparison:result.privateComparison}));
} finally { await browser.close(); }
