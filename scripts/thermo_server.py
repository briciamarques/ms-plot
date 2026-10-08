"""Local RAW reader and static site. Run after npm run build.

python scripts/thermo_server.py --port 8765
Requires ProteoWizard msconvert with Thermo support. Set MSCONVERT_PATH or --msconvert.
No RAWs or spectra are retained. Bind to loopback only; place behind an authenticated
same-origin gateway before deploying as a shared service.
"""
import argparse
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import threading
import zlib
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parent.parent
NS = {'m': 'http://psi.hupo.org/ms/mzml'}
MAX_BYTES = 512 * 1024 * 1024
MAX_POINTS = 5_000_000
LOCK = threading.Lock()

def reader_path(explicit=None):
    candidate = explicit or os.environ.get('MSCONVERT_PATH') or shutil.which('msconvert')
    if candidate and Path(candidate).is_file():
        return str(Path(candidate).resolve())
    candidates = list(Path(os.environ.get('ProgramFiles', 'C:/Program Files')).glob('ProteoWizard/*/msconvert.exe'))
    return str(max(candidates, key=lambda p: p.stat().st_mtime)) if candidates else None

def cv(element):
    return {p.get('accession'): p.get('value') for p in element.findall('.//m:cvParam', NS)}

def read_mzml(path):
    channels = {}
    instrument = ''
    points = 0
    for _, element in ET.iterparse(path, events=['end']):
        tag = element.tag.rsplit('}', 1)[-1]
        if tag == 'referenceableParamGroup' and not instrument:
            instrument = next((p.get('name') for p in element.findall('m:cvParam', NS) if p.get('accession') != 'MS:1000529'), '')
        if tag != 'spectrum':
            continue
        params = cv(element)
        if 'MS:1000511' not in params:
            element.clear()
            continue
        mode = 'profile' if 'MS:1000128' in params else 'centroid'
        polarity = 'positive' if 'MS:1000130' in params else 'negative' if 'MS:1000129' in params else 'unknown'
        precursor = params.get('MS:1000744', '')
        level = params['MS:1000511']
        label = params.get('MS:1000512') or f'MS{level} {polarity} {precursor} {mode}'
        key = json.dumps([label, mode, level, polarity, precursor])
        arrays = {}
        for arr in element.findall('./m:binaryDataArrayList/m:binaryDataArray', NS):
            acv = cv(arr)
            kind = 'mz' if 'MS:1000514' in acv else 'intensity' if 'MS:1000515' in acv else None
            if kind is None:
                continue
            if any(accession in acv for accession in ['MS:1002312', 'MS:1002313', 'MS:1002314']):
                raise ValueError('Numpress mzML is not supported. Export standard 32/64-bit mzML.')
            if 'MS:1000523' not in acv and 'MS:1000521' not in acv:
                raise ValueError('Unsupported numeric array encoding')
            encoded = base64.b64decode(arr.find('m:binary', NS).text or '', validate=True)
            if 'MS:1000574' in acv:
                decoder = zlib.decompressobj()
                encoded = decoder.decompress(encoded, MAX_POINTS * 8 + 1)
                if len(encoded) > MAX_POINTS * 8 or not decoder.eof:
                    raise ValueError('Spectrum exceeds the reader memory limit')
            fmt = 'd' if 'MS:1000523' in acv else 'f'
            arrays[kind] = struct.unpack('<' + fmt * (len(encoded) // struct.calcsize(fmt)), encoded)
        mz, intensity = arrays.get('mz', ()), arrays.get('intensity', ())
        if len(mz) != len(intensity) or len(mz) != int(element.get('defaultArrayLength', -1)):
            raise ValueError('Spectrum array lengths do not match')
        if not all(math.isfinite(x) and x > 0 for x in mz) or not all(math.isfinite(y) and y >= 0 for y in intensity):
            raise ValueError('Invalid mass or intensity in spectrum')
        if any(a > b for a, b in zip(mz, mz[1:])):
            raise ValueError('Spectrum masses are not sorted')
        # Omit zero samples only; extraction explicitly includes zero for every
        # scan without positive signal in the selected mass window.
        peaks = [{'mz': x, 'intensity': y} for x, y in zip(mz, intensity) if y > 0]
        points += len(peaks)
        if points > MAX_POINTS:
            raise ValueError('Too many nonzero data points; split the acquisition before importing')
        time_node = element.find('.//m:cvParam[@accession="MS:1000016"]', NS)
        time = float(time_node.get('value')) if time_node is not None else 0
        if time_node is not None and time_node.get('unitAccession') == 'UO:0000031':
            time *= 60
        channel = channels.setdefault(key, {'key': key, 'label': label, 'msLevel': int(level), 'precursor': precursor, 'mode': mode, 'instrument': instrument, 'scans': []})
        channel['scans'].append({'timeSeconds': time, 'peaks': peaks})
        element.clear()
    if not channels:
        raise ValueError('No readable mass spectra found')
    return list(channels.values())

def convert_raw(raw, output, reader):
    if not reader:
        raise ValueError('Thermo RAW reader unavailable. Install ProteoWizard with vendor readers, then restart the local reader.')
    with raw.open('rb') as stream:
        if stream.read(18) != b'\x01\xa1F\x00i\x00n\x00n\x00i\x00g\x00a\x00n\x00':
            raise ValueError('This is not a Thermo RAW file')
    result = subprocess.run([reader, str(raw), '--mzML', '--64', '--inten64', '--outdir', str(output)],
                            capture_output=True, timeout=180, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    mzml = output / (raw.stem + '.mzML')
    if result.returncode != 0 or not mzml.is_file():
        raise ValueError('The vendor reader could not convert this RAW. Check that the acquisition is complete and the reader supports your instrument.')
    return read_mzml(mzml)

class Handler(BaseHTTPRequestHandler):
    def allowed_host(self):
        if urlsplit('http://' + self.headers.get('Host', '')).hostname not in {'127.0.0.1', 'localhost', '::1'}:
            self.send_json(403, {'error': 'This reader accepts local hostnames only'})
            return False
        return True

    def send_json(self, status, data):
        payload = json.dumps(data, allow_nan=False, separators=(',', ':')).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if not self.allowed_host():
            return
        route = urlsplit(self.path).path
        if route == '/api/thermo/status':
            self.send_json(200, {'available': bool(self.server.reader), 'maxBytes': MAX_BYTES})
            return
        if route.startswith('/api/'):
            self.send_json(404, {'error': 'Unknown endpoint'})
            return
        public = (ROOT / 'dist').resolve()
        path = (public / unquote(route).lstrip('/')).resolve()
        if not path.is_relative_to(public):
            self.send_error(403)
            return
        if path.is_dir():
            path = path / 'index.html'
        if not path.is_file():
            self.send_error(404, 'Build the site with npm run build first')
            return
        import mimetypes
        payload = path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(path)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        if not self.allowed_host():
            return
        if urlsplit(self.path).path != '/api/thermo/convert':
            self.send_json(404, {'error': 'Unknown endpoint'})
            return
        # Browsers may only send the binary upload from this site. There is no
        # permissive CORS handler and no user-controlled filesystem/subprocess path.
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            self.send_json(403, {'error': 'Open the site from the reader address to import RAW files'})
            return
        if self.headers.get('Content-Type') != 'application/octet-stream':
            self.send_json(415, {'error': 'Binary RAW upload required'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            size = 0
        if not 0 < size <= MAX_BYTES:
            self.send_json(413, {'error': 'File is empty or exceeds the 512 MB limit'})
            return
        if not LOCK.acquire(blocking=False):
            self.send_json(503, {'error': 'Reader busy; retry when the current file finishes'})
            return
        try:
            self.connection.settimeout(180)
            with tempfile.TemporaryDirectory(prefix='pdms-thermo-') as temp:
                directory = Path(temp)
                raw = directory / 'input.raw'
                digest = hashlib.sha256()
                remaining = size
                with raw.open('wb') as stream:
                    while remaining:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        if not chunk:
                            raise ValueError('Incomplete upload')
                        remaining -= len(chunk)
                        digest.update(chunk)
                        stream.write(chunk)
                channels = convert_raw(raw, directory, self.server.reader)
                self.send_json(200, {'fingerprint': digest.hexdigest(), 'channels': channels})
        except (ValueError, ET.ParseError, struct.error, zlib.error) as error:
            self.send_json(422, {'error': str(error)})
        except subprocess.TimeoutExpired:
            self.send_json(504, {'error': 'RAW conversion timed out after 180 seconds'})
        except Exception:
            self.send_json(500, {'error': 'RAW reader failed; check the local reader console'})
        finally:
            LOCK.release()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--msconvert')
    options = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', options.port), Handler)
    server.reader = reader_path(options.msconvert)
    print(f'PD-MS site and RAW reader: http://127.0.0.1:{options.port}', flush=True)
    print('Thermo reader: ' + ('ready' if server.reader else 'not installed'), flush=True)
    server.serve_forever()
