"""Disposable Android emulator QA; no provider credentials or backend requests."""
import json, os, re, subprocess, time, xml.etree.ElementTree as ET
from pathlib import Path
OUT=Path('output/w200-native'); OUT.mkdir(parents=True,exist_ok=True)
PKG='com.joinlooper.shell'
expected_height=1920
emulator_process=None
emulator_log=None
launcher_recoveries=[]
def adb(*args):
    return subprocess.check_output(['adb',*args],timeout=45).decode('utf-8',errors='replace')
def tree():
    # A cold-start splash may temporarily have no accessibility root. Retry only
    # that exact readiness condition; never read an XML left by an earlier dump.
    for attempt in range(6):
        adb('shell','rm','-f','/sdcard/looper-ui.xml')
        result=subprocess.run(['adb','shell','uiautomator','dump','/sdcard/looper-ui.xml'],capture_output=True,text=True,timeout=45)
        output=result.stdout+result.stderr
        if 'null root node returned by UiTestAutomationBridge' in output:
            with OUT.joinpath('ui-root-readiness.log').open('a',encoding='utf-8') as log:
                log.write(f'height={expected_height} attempt={attempt+1} '+output+'\n')
            if attempt==5: raise AssertionError('UI accessibility root unavailable after 6 attempts')
            time.sleep(1)
            continue
        result.check_returncode()
        return adb('shell','cat','/sdcard/looper-ui.xml')
def find(value,xml=None):
    if xml is None: xml=tree()
    for n in ET.fromstring(xml).iter('node'):
        if any(value == n.get(k,'') or value in n.get(k,'') for k in ['resource-id','content-desc','text']):
            return n
    return None

def wait(value):
    for _ in range(12):
        xml=tree()
        n=find(value,xml)
        if n is not None: return n
        # Fresh Google API emulator boot can show a Launcher ANR above a healthy app.
        # Recover only this exact system dialog once per physical profile. Never hide Looper ANRs.
        titles=[n.get('text','') for n in ET.fromstring(xml).iter('node')]
        if "Pixel Launcher isn't responding" in titles:
            if expected_height in launcher_recoveries: raise AssertionError('Repeated Pixel Launcher ANR')
            OUT.joinpath(f'launcher-anr-{expected_height}.xml').write_text(xml,encoding='utf-8')
            OUT.joinpath(f'launcher-anr-{expected_height}.png').write_bytes(subprocess.check_output(['adb','exec-out','screencap','-p'],timeout=30))
            launcher_recoveries.append(expected_height)
            adb('shell','am','force-stop','com.google.android.apps.nexuslauncher')
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
def stop_emulator():
    global emulator_process,emulator_log
    if emulator_process is not None:
        subprocess.run(['adb','emu','kill'],timeout=15,check=False,capture_output=True)
        try: emulator_process.wait(timeout=30)
        except subprocess.TimeoutExpired:
            emulator_process.terminate()
            emulator_process.wait(timeout=15)
        emulator_process=None
    if emulator_log is not None:
        emulator_log.close(); emulator_log=None

def boot_profile(height):
    global emulator_process,emulator_log,expected_height
    stop_emulator(); expected_height=height
    emulator_log=OUT.joinpath(f'emulator-{height}.log').open('w')
    emulator_process=subprocess.Popen([os.path.join(os.environ['ANDROID_HOME'],'emulator','emulator'),'-avd',f'looper-w200-{height}','-skin',f'1080x{height}','-no-window','-no-audio','-no-boot-anim','-no-snapshot','-gpu','swiftshader_indirect','-memory','2048'],stdout=emulator_log,stderr=subprocess.STDOUT)
    subprocess.run(['adb','wait-for-device'],timeout=180,check=True)
    deadline=time.monotonic()+180
    while adb('shell','getprop','sys.boot_completed').strip()!='1':
        if emulator_process.poll() is not None or time.monotonic()>deadline: raise RuntimeError('Emulator boot failed')
        time.sleep(2)
    adb('shell','input','keyevent','82')
    adb('shell','wm','size','reset'); adb('shell','wm','density','480')
    OUT.joinpath(f'display-{height}.txt').write_text(adb('shell','wm','size')+adb('shell','wm','density'),encoding='utf-8')
    adb('install','-r',str(OUT/'Looper-W200-test.apk'))
    adb('shell','svc','wifi','disable'); adb('shell','svc','data','disable')

def shot(name):
    png=subprocess.check_output(['adb','exec-out','screencap','-p'],timeout=30)
    OUT.joinpath(name+'.png').write_bytes(png)
    actual=(int.from_bytes(png[16:20],'big'),int.from_bytes(png[20:24],'big'))
    assert actual==(1080,expected_height), f'Physical screenshot size mismatch: {name} {actual}'
    OUT.joinpath(name+'.xml').write_text(tree(),encoding='utf-8')
results=[]
try:
    # Prove that the installed APK has an embedded bundle: no Metro, offline radio.
    for ratio,height in [('9-16',1920),('9-19.5',2340)]:
        boot_profile(height)
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
        results.append({'ratio':ratio,'screenshotPixels':[1080,height],'status':'PASS','nativeApkInstalled':True,'offline':True,'androidBack':'PASS','touchTargets':'exercised','physicalDevice':False})
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
    try: OUT.joinpath('logcat.txt').write_text(adb('logcat','-d','-t','2000'),encoding='utf-8')
    except Exception as e: OUT.joinpath('logcat-unavailable.txt').write_text(str(e),encoding='utf-8')
    stop_emulator()
    OUT.joinpath('native-smoke.json').write_text(json.dumps({'status':status,'scope':'Android emulator, installed standalone test APK; NOT physical iPhone QA','results':results,'launcherAnrRecoveries':launcher_recoveries},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'status':status,'results':results,'launcherAnrRecoveries':launcher_recoveries},ensure_ascii=False),flush=True)
if status!='PASS': raise SystemExit(1)
