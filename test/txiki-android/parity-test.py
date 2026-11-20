import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET

serial = os.environ.get('ANDROID_SERIAL', '')
if not serial.startswith('emulator-'):
    raise RuntimeError('Set ANDROID_SERIAL to an Android emulator with the Mobile Parity fixture installed')
package = 'dev.gpuix.mobileparity'


def adb(*args):
    return subprocess.run(['adb', '-s', serial, *args], check=True, capture_output=True, text=True, timeout=45).stdout


def tree():
    adb('shell', 'uiautomator', 'dump', '/sdcard/gpuix-parity.xml')
    return ET.fromstring(adb('shell', 'cat', '/sdcard/gpuix-parity.xml'))


def find(label, role=None):
    end = time.monotonic() + 30
    while time.monotonic() < end:
        for node in tree().iter('node'):
            if label in (node.get('text'), node.get('content-desc')) and (role is None or node.get('class') == role):
                return node
        time.sleep(.25)
    raise AssertionError(f'{label!r} not found')


def point(node):
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
    return (x1 + x2) // 2, (y1 + y2) // 2


def tap(label):
    x, y = point(find(label))
    adb('shell', 'input', 'tap', str(x), str(y))


def hold(label):
    x, y = point(find(label))
    adb('shell', 'input', 'swipe', str(x), str(y), str(x), str(y), '900')


adb('shell', 'am', 'force-stop', package)
adb('shell', 'am', 'start', '-W', '-n', f'{package}/dev.gpuix.mobile.MainActivity')
find('Filesystem passed')
slider = find('Volume', 'android.widget.SeekBar')
x1, y1, x2, y2 = map(int, re.findall(r'\d+', slider.get('bounds', '')))
y = (y1 + y2) // 2
adb('shell', 'input', 'swipe', str(x1 + (x2 - x1) // 5), str(y), str(x1 + 4 * (x2 - x1) // 5), str(y), '600')
end = time.monotonic() + 15
while time.monotonic() < end:
    labels = [n.get('text', '') for n in tree().iter('node')]
    if any(re.fullmatch(r'Volume: (?:[7-9]\d|100)', text) for text in labels):
        break
else:
    raise AssertionError(f'slider did not follow touch: {labels}')
tap('Next screen')
find('Route: /second')
tap('Open overlay')
find('Overlay open')
adb('shell', 'input', 'keyevent', '4')
find('Overlay closed')
find('Route: /second')
adb('shell', 'input', 'keyevent', '4')
find('Route: /')
hold('Hold secondary')
find('Secondary: 1')
x, y = point(find('Hold for help'))
press = subprocess.Popen(['adb', '-s', serial, 'shell', 'input', 'swipe', str(x), str(y), str(x), str(y), '8000'])
try:
    find('Touch help')
finally:
    press.wait(timeout=15)
print('PASS: async filesystem, resource packaging, touch drag, Back ordering and long press')
