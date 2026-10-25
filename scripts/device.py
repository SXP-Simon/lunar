"""Small ADB/uiautomator2 helpers. Requires an already booted test device."""
import os
from pathlib import Path
import shutil
import subprocess
import re
import time
import xml.etree.ElementTree as ET
import uiautomator2 as u

ADB = os.environ.get('LUNAR_ADB') or shutil.which('adb')
SERIAL = os.environ.get('ANDROID_SERIAL', 'emulator-5554')
ROOT = Path(__file__).resolve().parents[1]
d = u.connect(SERIAL)
d.jsonrpc.setConfigurator({'waitForIdleTimeout': 0, 'waitForSelectorTimeout': 0})

def adb(*args):
    return subprocess.check_output([ADB, '-s', SERIAL, *args])

def tap(label):
    deadline = time.monotonic() + 30
    node = None
    while time.monotonic() < deadline:
        nodes = ET.fromstring(d.dump_hierarchy()).iter('node')
        node = next((n for n in nodes if n.get('text') == label or n.get('content-desc') == label), None)
        if node is not None:
            break
        time.sleep(.5)
    if node is None:
        raise RuntimeError('Missing UI label: ' + label)
    x, y, r, b = map(int, re.findall(r'\d+', node.get('bounds')))
    adb('shell', 'input', 'tap', str((x+r)//2), str((y+b)//2))
    time.sleep(1)

def snapshot(name):
    output = ROOT / 'device'
    output.mkdir(exist_ok=True)
    (output / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p'))
    xml = d.dump_hierarchy()
    (output / (name + '.xml')).write_text(xml, encoding='utf-8')
    for n in ET.fromstring(xml).iter('node'):
        if n.get('text') or n.get('content-desc'):
            print(n.get('text'), '|', n.get('content-desc'), n.get('bounds'))

if __name__ == '__main__':
    import sys
    snapshot(sys.argv[1] if len(sys.argv) > 1 else 'current')
