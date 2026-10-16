"""Disposable Android emulator QA; no provider credentials or backend requests."""
import json, os, re, subprocess, time, xml.etree.ElementTree as ET
from pathlib import Path
OUT=Path('output/w200-native'); OUT.mkdir(parents=True,exist_ok=True)
PKG='com.joinlooper.shell'
def adb(*args):
    return subprocess.check_output(['adb',*args],timeout=45).decode('utf-8',errors='replace')
def tree():
    adb('shell','uiautomator','dump','/sdcard/looper-ui.xml')
    return adb('shell','cat','/sdcard/looper-ui.xml')
def find(value):
    xml=tree()
    for n in ET.fromstring(xml).iter('node'):
        if any(value == n.get(k,'') or value in n.get(k,'') for k in ['resource-id','content-desc','text']):
            return n
    return None

def wait(value):
    for _ in range(12):
        n=find(value)
        if n is not None: return n
        time.sleep(1)
    raise AssertionError('Native UI missing: '+value)
def reveal(value):
    # Native ScrollViews omit offscreen controls from the accessibility tree.
    # Bounded real swipes preserve the same target and assertions.
    for direction in [1] * 5 + [-1] * 5:
        n=find(value)
        if n is not None: return n
        sizes=re.findall(r'(\d+)x(\d+)',adb('shell','wm','size'))
        width,height=map(int,sizes[-1])
        start,end=(.75,.32) if direction==1 else (.32,.75)
        adb('shell','input','swipe',str(width//2),str(int(height*start)),str(width//2),str(int(height*end)),'350')
        time.sleep(.4)
    return wait(value)

def tap(value):
    n=reveal(value); nums=list(map(int,re.findall(r'\d+',n.attrib['bounds'])))
    adb('shell','input','tap',str((nums[0]+nums[2])//2),str((nums[1]+nums[3])//2)); time.sleep(.7)
def shot(name):
    OUT.joinpath(name+'.png').write_bytes(subprocess.check_output(['adb','exec-out','screencap','-p'],timeout=30))
    OUT.joinpath(name+'.xml').write_text(tree(),encoding='utf-8')
results=[]
try:
    # Prove that the installed APK has an embedded bundle: no Metro, offline radio.
    adb('shell','svc','wifi','disable'); adb('shell','svc','data','disable')
    for ratio,height in [('9-16',1920),('9-19.5',2340)]:
        adb('shell','wm','size',f'1080x{height}'); adb('shell','wm','density','480')
        adb('shell','am','force-stop',PKG)
        adb('shell','monkey','-p',PKG,'-c','android.intent.category.LAUNCHER','1')
        wait('enter-forest'); shot(ratio+'-welcome'); tap('enter-forest')
        wait('stump-hotspot'); wait('marmot-slot'); wait('sprout-hotspot')
        assert find('rabbit-slot') is None and find('treehouse-entry') is None
        shot(ratio+'-forest-lv1')
        tap('stump-hotspot'); wait('answer-reuse'); shot(ratio+'-knowledge-initial'); tap('answer-single'); reveal('再想一想'); tap('answer-reuse'); reveal('答對了'); shot(ratio+'-knowledge')
        adb('shell','input','keyevent','4'); wait('stump-hotspot')
        tap('open-progress'); shot(ratio+'-progress-initial'); tap('complete-mission'); wait('示範任務已完成'); shot(ratio+'-progress')
        adb('shell','input','keyevent','4'); tap('sprout-hotspot'); tap('記錄本機關心'); wait('已記錄本機關心'); tap('close-sheet')
        tap('marmot-slot'); wait('在這裡'); adb('shell','input','keyevent','4'); wait('stump-hotspot')
        tap('open-tools'); tap('fixture-lv5'); wait('rabbit-slot'); wait('treehouse-entry'); shot(ratio+'-forest-lv5')
        tap('treehouse-entry'); wait('樹屋入口'); tap('close-sheet')
        tap('open-tools'); tap('reduced-motion-toggle'); tap('close-sheet'); wait('減少動態：已啟用'); shot(ratio+'-reduced-motion')
        tap('open-tools'); tap('模擬場景錯誤'); wait('scene-error'); shot(ratio+'-error'); tap('重新載入本機場景'); wait('stump-hotspot')
        tap('open-tools'); tap('模擬載入中'); wait('scene-loading'); shot(ratio+'-loading'); tap('返回測試場景'); wait('stump-hotspot')
        results.append({'ratio':ratio,'status':'PASS','nativeApkInstalled':True,'offline':True,'androidBack':'PASS','touchTargets':'exercised','physicalDevice':False})
    # OS reduced motion independently from the in-app override.
    adb('shell','am','force-stop',PKG)
    adb('shell','settings','put','global','transition_animation_scale','0')
    adb('shell','monkey','-p',PKG,'-c','android.intent.category.LAUNCHER','1')
    tap('enter-forest'); wait('減少動態：已啟用'); shot('system-reduced-motion')
    status='PASS'
except Exception as e:
    status='FAIL'; results.append({'error':str(e)})
    try: shot('failure')
    except Exception: pass
finally:
    OUT.joinpath('logcat.txt').write_text(adb('logcat','-d','-t','2000'),encoding='utf-8')
    OUT.joinpath('native-smoke.json').write_text(json.dumps({'status':status,'scope':'Android emulator, installed standalone test APK; NOT physical iPhone QA','results':results},ensure_ascii=False,indent=2),encoding='utf-8')
if status!='PASS': raise SystemExit(1)
