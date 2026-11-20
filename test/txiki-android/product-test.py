import os
import re
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path

serial = os.environ.get('ANDROID_SERIAL', '')
if not serial.startswith('emulator-'):
    raise RuntimeError('Set ANDROID_SERIAL to the Android emulator to test')
package = 'dev.gpuix.svelte.mobilecounter'
remote = '/sdcard/Download/gpuix-mobile-upload-test.txt'


def adb(*args, check=True):
    return subprocess.run(['adb', '-s', serial, *args], check=check, capture_output=True, text=True, timeout=45)


def tree():
    adb('shell', 'uiautomator', 'dump', '/sdcard/gpuix-mobile-test.xml')
    return ET.fromstring(adb('shell', 'cat', '/sdcard/gpuix-mobile-test.xml').stdout)


def wait_for(label):
    for _ in range(20):
        root = tree()
        for node in root.iter('node'):
            if label in (node.get('text', ''), node.get('content-desc', '')):
                return node
        time.sleep(0.3)
    raise AssertionError(f'{label!r} was not visible')


def tap(node):
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
    adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))


assert adb('shell', 'getprop', 'ro.kernel.qemu').stdout.strip() == '1'
if adb('shell', 'test', '-e', remote, check=False).returncode == 0:
    raise RuntimeError(f'Refusing to overwrite {remote}')
try:
    with tempfile.TemporaryDirectory() as tmp:
        local = Path(tmp) / 'gpuix-mobile-upload-test.txt'
        local.write_text('chosen document works', encoding='utf8')
        adb('push', str(local), remote)
    adb('shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', f'file://{remote}')
    adb('shell', 'am', 'force-stop', package)
    adb('shell', 'am', 'start', '-W', '-n', f'{package}/dev.gpuix.mobile.MainActivity')
    wait_for('Filesystem passed')
    tap(wait_for('Open file'))
    tap(wait_for('gpuix-mobile-upload-test.txt'))
    wait_for('Imported: chosen document works')
    print('PASS: generated Android app imports and reads a selected document')
finally:
    adb('shell', 'rm', '-f', remote, check=False)
