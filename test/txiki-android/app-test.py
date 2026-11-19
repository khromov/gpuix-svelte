import email
from email import policy
from http.server import BaseHTTPRequestHandler, HTTPServer
import os
from pathlib import Path
import random
import re
import struct
import subprocess
import tempfile
import threading
import time
import xml.etree.ElementTree as ET
import zlib

SERIAL = os.environ.get('ANDROID_SERIAL', '')
if not SERIAL.startswith('emulator-'):
    raise RuntimeError('Set ANDROID_SERIAL to the Android emulator to test')
PACKAGE = 'dev.gpuix.txikidemo'
ACTIVITY = PACKAGE + '/.MainActivity'
EVIDENCE = Path(os.environ.get('EVIDENCE_DIR', 'dist/txiki-android/evidence'))
EVIDENCE.mkdir(parents=True, exist_ok=True)


def adb(*args):
    return subprocess.run(['adb', '-s', SERIAL, *args], check=True,
                          capture_output=True, text=True, timeout=45).stdout


def tree():
    adb('shell', 'uiautomator', 'dump', '/sdcard/gpuix-txiki-window.xml')
    return ET.fromstring(adb('shell', 'cat', '/sdcard/gpuix-txiki-window.xml'))


def wait_for(expected):
    last = ''
    for _ in range(15):
        root = tree()
        last = ' '.join(node.get('text', '') for node in root.iter('node'))
        if expected in last:
            return root
        time.sleep(0.4)
    raise AssertionError(f'Expected {expected!r}, saw {last!r}')


def tap(label=None, class_name=None, y_fraction=0.5):
    root = tree()
    node = next(node for node in root.iter('node')
                if (label and (node.get('text') == label or node.get('content-desc') == label))
                or (class_name and node.get('class') == class_name))
    bounds = list(map(int, re.findall(r'\d+', node.get('bounds', ''))))
    assert len(bounds) == 4, bounds
    adb('shell', 'input', 'tap', str((bounds[0] + bounds[2]) // 2), str(int(bounds[1] + (bounds[3] - bounds[1]) * y_fraction)))


def test_image_upload():
    remote = '/sdcard/Download/gpuix-txiki-upload-test.png'
    if subprocess.run(['adb', '-s', SERIAL, 'shell', 'test', '-e', remote]).returncode == 0:
        raise RuntimeError(f'Refusing to overwrite {remote}')
    if any(line.split()[1:2] == ['tcp:45137'] for line in adb('reverse', '--list').splitlines()):
        raise RuntimeError('Refusing to replace an existing reverse on port 45137')

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    random_bytes = random.Random(19).randbytes(256 * 256 * 4)
    rows = b''.join(b'\0' + random_bytes[y * 1024:(y + 1) * 1024] for y in range(256))
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 256, 256, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
    received = []

    class Upload(BaseHTTPRequestHandler):
        def do_POST(self):
            try:
                length = int(self.headers['Content-Length'])
                body = self.rfile.read(length)
                message = email.message_from_bytes(
                    b'Content-Type: ' + self.headers['Content-Type'].encode() + b'\r\nMIME-Version: 1.0\r\n\r\n' + body,
                    policy=policy.default)
                parts = list(message.iter_parts())
                assert self.path == '/upload' and len(parts) == 1
                assert parts[0].get_param('name', header='content-disposition') == 'file'
                assert parts[0].get_filename() == 'upload.png'
                assert parts[0].get_content_type() == 'image/png'
                assert parts[0].get_payload(decode=True) == png
                received.append(True)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'OK')
            except Exception as error:
                received.append(error)
                self.send_error(400, str(error))

        def log_message(self, *_args):
            pass

    server = HTTPServer(('127.0.0.1', 0), Upload)
    server.timeout = 30
    thread = threading.Thread(target=server.handle_request, daemon=True)
    reversed_port = False
    try:
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(tmp) / 'gpuix-txiki-upload-test.png'
            local.write_bytes(png)
            adb('push', str(local), remote)
        adb('shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file://' + remote)
        adb('reverse', 'tcp:45137', f'tcp:{server.server_port}')
        reversed_port = True
        thread.start()
        tap('Choose file')
        wait_for('gpuix-txiki-upload-test.png')
        tap('gpuix-txiki-upload-test.png')
        wait_for('Image uploaded')
        thread.join(timeout=5)
        assert received == [True], f'Multipart upload mismatch: {received}'
    finally:
        if reversed_port:
            adb('reverse', '--remove', 'tcp:45137')
        adb('shell', 'rm', '-f', remote)
        if thread.ident is not None:
            thread.join(timeout=31)
        server.server_close()


def launch():
    adb('shell', 'am', 'start', '-W', '-n', ACTIVITY)
    wait_for('txiki.js + Svelte')


def pid():
    return adb('shell', 'pidof', PACKAGE).strip()


def logs(process):
    return adb('logcat', '-d', '--pid=' + process)


def screenshot(name):
    image = subprocess.run(['adb', '-s', SERIAL, 'exec-out', 'screencap', '-p'],
                           check=True, capture_output=True, timeout=30).stdout
    (EVIDENCE / (name + '.png')).write_bytes(image)


def timer():
    text = ' '.join(node.get('text', '') for node in tree().iter('node'))
    return int(re.search(r'Timer: (\d+)', text)[1])


assert adb('shell', 'getprop', 'ro.kernel.qemu').strip() == '1'
adb('shell', 'am', 'force-stop', PACKAGE)
launch()
process = pid()
wait_for('Count: 0')
wait_for('HTTPS OK')
wait_for('Native ready')
tap('Choose file')
for _ in range(30):
    if 'documentsui' in adb('shell', 'dumpsys', 'activity', 'activities').lower():
        break
    time.sleep(0.25)
else:
    raise AssertionError('System file picker did not open')
adb('shell', 'input', 'keyevent', 'BACK')
wait_for('Picker cancelled')
test_image_upload()
first_tick = timer()
time.sleep(2)
assert timer() > first_tick, 'txiki timer did not advance'
tap('Increment')
wait_for('Count: 1')
tap('Increment')
wait_for('Count: 2')
tap('Reset')
wait_for('Count: 0')
tap(class_name='android.widget.EditText', y_fraction=0.35)
for _ in range(40):
    state = adb('shell', 'dumpsys', 'input_method')
    if 'mInputShown=true' in state and 'mInputViewStarted=true' in state and 'InputProxy' in state and ('mServedInputConnection=' in state or 'mServedInputConnectionWrapper=' in state):
        break
    time.sleep(0.25)
else:
    raise AssertionError('Native input connection was not installed')
time.sleep(2)
adb('shell', 'input', 'text', 'txiki42')
wait_for('txiki42')
adb('shell', 'input', 'keyevent', 'BACK')
time.sleep(1)
tap('Save input')
wait_for('Saved: txiki42')
screenshot('input')
tap('Increment')
wait_for('Count: 1')
adb('shell', 'input', 'keyevent', 'HOME')
time.sleep(2)
launch()
assert pid() == process, 'Process changed while backgrounded'
wait_for('Count: 1')
wait_for('Saved: txiki42')
wait_for('HTTPS OK')
screenshot('resumed')

original_auto = adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation').strip()
original_rotation = adb('shell', 'settings', 'get', 'system', 'user_rotation').strip()
try:
    adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
    for rotation in ('1', '0'):
        adb('shell', 'settings', 'put', 'system', 'user_rotation', rotation)
        for _ in range(20):
            if tree().get('rotation') == rotation:
                break
            time.sleep(0.5)
        else:
            raise AssertionError(f'Display did not rotate to {rotation}')
        assert pid() == process, 'Rotation killed the process'
        wait_for('Count: 1')
        wait_for('Saved: txiki42')
finally:
    for key, value in [('user_rotation', original_rotation), ('accelerometer_rotation', original_auto)]:
        if value == 'null':
            adb('shell', 'settings', 'delete', 'system', key)
        else:
            adb('shell', 'settings', 'put', 'system', key, value)

for cycle in range(3):
    if 'mInputShown=true' in adb('shell', 'dumpsys', 'input_method'):
        adb('shell', 'input', 'keyevent', 'BACK')
        for _ in range(40):
            if 'mInputShown=true' not in adb('shell', 'dumpsys', 'input_method'):
                break
            time.sleep(0.25)
        else:
            raise AssertionError('Keyboard did not close before Activity teardown')
    before = logs(process).count('txiki runtime disposed: 0')
    adb('shell', 'input', 'keyevent', 'BACK')
    for _ in range(60):
        if logs(process).count('txiki runtime disposed: 0') > before:
            break
        time.sleep(0.25)
    else:
        raise AssertionError('txiki runtime did not stop and free cleanly')
    assert pid() == process, 'Activity destruction killed the process'
    launch()
    assert pid() == process, 'This was not same-process Activity recreation'
    wait_for('Count: 0')
    wait_for('Saved: Nothing saved')
    wait_for('HTTPS OK')
    wait_for('Native ready')
    tap('Increment')
    wait_for('Count: 1')
    print(f'Activity recreation {cycle + 1}: passed')

# Repeated dumper disconnects exercise delivery of queued accessibility events.
for _ in range(3):
    wait_for('HTTPS OK')
    time.sleep(1.5)
assert pid() == process, 'App crashed after accessibility client disconnect'
log = logs(process)
(EVIDENCE / 'logcat.txt').write_text(log)
assert 'PANIC' not in log and 'Fatal signal' not in log, 'Native runtime failure'
assert 'GPUI session timed out' not in log, 'Bridge timed out'
screenshot('final')
print('PASS: txiki.js + gpuix-svelte Android: selected PNG and multipart upload, native rendering, input, timer, HTTPS, resume, rotation, recreation')
