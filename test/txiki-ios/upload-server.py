import email
from email import policy
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import random
import struct
import sys
import zlib


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
            body = self.rfile.read(int(self.headers['Content-Length']))
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


with HTTPServer(('127.0.0.1', 45137), Upload) as server:
    server.timeout = 180
    Path(sys.argv[1]).write_bytes(png)
    Path(sys.argv[2]).write_text('ready')
    server.handle_request()
if received != [True]:
    raise RuntimeError(f'Multipart upload mismatch: {received}')
print('PASS: selected PNG multipart bytes verified')
