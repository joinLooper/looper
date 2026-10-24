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
            # Dismissing the system Launcher by force-stop can destroy the
            # foreground task during subsequent stack navigation. Choose the
            # system dialog's explicit Wait action instead, and preserve proof.
            wait_button=next((node for node in ET.fromstring(xml).iter('node')
                              if node.get('resource-id')=='android:id/aerr_wait'),None)
            if wait_button is None:
                raise AssertionError('Pixel Launcher ANR without a visible Wait control')
            coords=list(map(int,re.findall(r'\d+',wait_button.attrib['bounds'])))
            adb('shell','input','tap',str((coords[0]+coords[2])//2),str((coords[1]+coords[3])//2))
            launcher_recoveries.append(expected_height)
            time.sleep(2)
        time.sleep(1)
    raise AssertionError('Native UI missing: '+value)
def screen_size():
    sizes=re.findall(r'(\d+)x(\d+)',adb('shell','wm','size'))
    if not sizes: raise AssertionError('Unable to read emulator screen size')
    return tuple(map(int,sizes[-1]))

def tappable_bounds(node,width,height):
    """Reject non-visible ScrollView descendants even when they remain in UI XML.

    uiautomator can list an offscreen Pressable with a zero-sized/clipped
    rectangle; tapping its center closes the modal instead of pressing it.
    """
    if node is None: return None
    coords=list(map(int,re.findall(r'-?\d+',node.attrib.get('bounds',''))))
    if len(coords)!=4: return None
    x1,y1,x2,y2=coords
    cx,cy=(x1+x2)//2,(y1+y2)//2
    if x2-x1<16 or y2-y1<16: return None
    if not (0<=cx<width and max(24,height//40)<=cy<height-max(24,height//40)):
        return None
    return coords

def reveal(value):
    # Look for a visible, tappable node, not merely a string in the UI dump.
    # Re-check the XML after each real scroll gesture.
    width,height=screen_size()
    details=[]
    for idx,direction in enumerate([0]+[1]*6+[-1]*5):
        if direction:
            start,end=(.76,.34) if direction==1 else (.34,.76)
            adb('shell','input','swipe',str(width//2),str(int(height*start)),str(width//2),str(int(height*end)),'380')
            time.sleep(.45)
        n=find(value)
        coords=tappable_bounds(n,width,height)
        if coords:
            with OUT.joinpath('native-taps.jsonl').open('a',encoding='utf-8') as log:
                log.write(json.dumps({'target':value,'attempt':idx,'bounds':coords,'screen':[width,height]},ensure_ascii=False)+'\n')
            return n
        details.append({'attempt':idx,'bounds':n.attrib.get('bounds') if n is not None else None})
    OUT.joinpath('offscreen-target.json').write_text(
        json.dumps({'target':value,'screen':[width,height],'attempts':details},ensure_ascii=False,indent=2),
        encoding='utf-8',
    )
    raise AssertionError('Native UI target not visibly tappable: '+value)

def require_modal_closed(context):
    """Ensure a Close action actually removed the native modal, not merely
    that a hidden Forest node remains in the accessibility tree."""
    for _ in range(20):
        if find('forest-notebook') is None:
            return
        time.sleep(.35)
    xml=tree()
    OUT.joinpath('modal-close-failure.xml').write_text(xml,encoding='utf-8')
    OUT.joinpath('modal-close-failure.png').write_bytes(
        subprocess.check_output(['adb','exec-out','screencap','-p'],timeout=30))
    raise AssertionError('Forest modal did not close before next action: '+context)

def tap(value):
    n=reveal(value)
    width,height=screen_size()
    box=tappable_bounds(n,width,height)
    assert box is not None, 'Lost actionable bounds: '+value
    x1,y1,x2,y2=box
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
    time.sleep(.7)
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
        # W2-02: verify the rendered Native touch bounds, not only logical math.
        target_bounds=[]
        for target in ['stump-hotspot','marmot-slot','sprout-hotspot','open-progress','open-backpack','open-tools']:
            n=wait(target)
            x1,y1,x2,y2=map(int,re.findall(r'\d+',n.attrib['bounds']))
            assert x2-x1>=144 and y2-y1>=144, f'Under 48dp touch target: {target}'
            assert 0<=x1<x2<=1080 and 0<=y1<y2<=height, f'Clipped target: {target}'
            target_bounds.append((target,x1,y1,x2,y2))
        for i,a in enumerate(target_bounds):
            for b in target_bounds[i+1:]:
                assert not (a[1]<b[3] and a[3]>b[1] and a[2]<b[4] and a[4]>b[2]), f'Overlapping targets: {a[0]}, {b[0]}'
        OUT.joinpath(ratio+'-target-bounds.json').write_text(json.dumps(target_bounds),encoding='utf-8')
        tap('open-backpack'); wait('樹下的小布包'); shot(ratio+'-backpack'); tap('close-sheet')
        tap('stump-hotspot'); wait('answer-reuse'); shot(ratio+'-knowledge-initial'); tap('answer-single'); reveal('再想一想'); tap('answer-reuse'); reveal('答對了'); shot(ratio+'-knowledge')
        adb('shell','input','keyevent','4'); wait('stump-hotspot')
        tap('open-progress'); wait('forest-notebook'); shot(ratio+'-progress-initial'); tap('complete-mission'); wait('示範任務已完成'); shot(ratio+'-progress')
        adb('shell','input','keyevent','4')
        tap('sprout-hotspot'); wait('my-forest-info-panel'); wait('my-forest-stage-list')
        wait('my-forest-ledger-connection-state')
        shot(ratio+'-my-forest-info-candidate')
        tap('close-sheet'); wait('stump-hotspot')
        # Viewing My Forest must not run the legacy local-care action or
        # grant rewards; the five milestone states are backend-only.
        assert find('my-forest-info-panel') is None, 'My Forest info overlay not closed'
        tap('marmot-slot'); wait('在這裡'); adb('shell','input','keyevent','4'); wait('stump-hotspot')
        tap('open-tools'); tap('fixture-lv5'); wait('rabbit-slot'); wait('treehouse-entry'); shot(ratio+'-forest-lv5')
        tap('treehouse-entry'); wait('樹屋入口'); tap('close-sheet')
        require_modal_closed('treehouse-entry')
        tap('open-tools'); wait('reduced-motion-toggle'); tap('reduced-motion-toggle'); tap('close-sheet'); wait('減少動態：已啟用'); shot(ratio+'-reduced-motion')
        tap('open-tools'); shot(ratio+'-tools-before-error'); tap('simulate-scene-error'); shot(ratio+'-after-error-action'); wait('scene-error'); shot(ratio+'-error'); tap('重新載入本機場景'); wait('stump-hotspot')
        tap('open-tools'); tap('simulate-scene-loading'); shot(ratio+'-after-loading-action'); wait('scene-loading'); shot(ratio+'-loading'); tap('返回測試場景'); wait('stump-hotspot')
        tap('open-tools'); tap('查看玩家進度'); wait('complete-mission'); adb('shell','input','keyevent','4'); wait('stump-hotspot')
        tap('open-tools'); tap('return-welcome'); shot(ratio+'-after-return-action'); wait('enter-forest'); tap('enter-forest'); wait('stump-hotspot')
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

