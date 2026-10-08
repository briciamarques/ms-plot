"""Synthetic parser checks; optionally pass a directory of real RAWs for local validation."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from io import BytesIO
from types import SimpleNamespace
spec = importlib.util.spec_from_file_location('reader', Path(__file__).resolve().parents[1] / 'scripts/thermo_server.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)

def binary(values, kind):
    blob = reader.base64.b64encode(reader.zlib.compress(reader.struct.pack('<'+'d'*len(values),*values))).decode()
    return f'<binaryDataArray><cvParam accession="MS:1000523"/><cvParam accession="MS:1000574"/><cvParam accession="{kind}"/><binary>{blob}</binary></binaryDataArray>'

def fixture(intensities=(0,5,0), level=2):
    return f'''<mzML xmlns="http://psi.hupo.org/ms/mzml"><run><spectrumList><spectrum defaultArrayLength="3"><cvParam accession="MS:1000511" value="{level}"/><cvParam accession="MS:1000128"/><cvParam accession="MS:1000130"/><scanList><scan><cvParam accession="MS:1000016" value="0.5" unitAccession="UO:0000031"/></scan></scanList><binaryDataArrayList>{binary([99,100,101],'MS:1000514')}{binary(intensities,'MS:1000515')}</binaryDataArrayList></spectrum></spectrumList></run></mzML>'''

class ReaderTests(unittest.TestCase):
    def parse(self, content):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'test.mzML';path.write_text(content)
            return reader.read_mzml(path)
    def test_zero_samples_and_time(self):
        result=self.parse(fixture())[0]
        self.assertEqual(result['scans'],[{'timeSeconds':30,'peaks':[{'mz':100,'intensity':5}]}])
        self.assertEqual(result['mode'],'profile')
    def test_invalid_arrays(self):
        for values in [(1,2),(1,float('nan'),2),(1,-1,2)]:
            with self.assertRaises(ValueError):self.parse(fixture(values))
    def test_no_spectra(self):
        with self.assertRaises(ValueError):self.parse('<mzML/>')
    def test_fake_raw(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'fake.raw';path.write_bytes(b'not thermo')
            with self.assertRaisesRegex(ValueError,'not a Thermo'):reader.convert_raw(path,Path(temp),'msconvert')
    def request(self, headers=None, body=b'example', path='/api/thermo/convert'):
        handler=reader.Handler.__new__(reader.Handler)
        handler.path=path
        handler.headers={'Host':'127.0.0.1:8765','Origin':'http://127.0.0.1:8765','Content-Type':'application/octet-stream','Content-Length':str(len(body)),**(headers or {})}
        handler.rfile=BytesIO(body)
        handler.connection=SimpleNamespace(settimeout=lambda value:None)
        handler.server=SimpleNamespace(reader='test reader')
        response=[]
        handler.send_json=lambda status,data:response.append((status,data))
        handler.do_POST()
        return response[0]
    def test_upload_boundaries(self):
        self.assertEqual(self.request({'Origin':'http://foreign.example'})[0],403)
        self.assertEqual(self.request({'Host':'foreign.example'})[0],403)
        self.assertEqual(self.request({'Content-Type':'text/plain'})[0],415)
        self.assertEqual(self.request({'Content-Length':'0'})[0],413)
        self.assertEqual(self.request({'Content-Length':str(reader.MAX_BYTES+1)})[0],413)
        self.assertEqual(self.request(path='/api/unknown')[0],404)
    def test_upload_success_and_cleanup(self):
        temporary=[]
        def convert(path,output,program):
            self.assertEqual(path.read_bytes(),b'example')
            temporary.append(path.parent)
            return [{'scans':[]}]
        with patch.object(reader,'convert_raw',side_effect=convert):
            status,data=self.request()
        self.assertEqual(status,200)
        self.assertEqual(data['fingerprint'],reader.hashlib.sha256(b'example').hexdigest())
        self.assertFalse(temporary[0].exists())
    def test_busy(self):
        reader.LOCK.acquire()
        try:self.assertEqual(self.request()[0],503)
        finally:reader.LOCK.release()

if __name__ == '__main__':
    if len(sys.argv)>1:
        directory=Path(sys.argv.pop())
        program=reader.reader_path()
        files=list(directory.glob('*.raw'))
        counts=[]
        for raw in files:
            with tempfile.TemporaryDirectory() as temp:
                channels=reader.convert_raw(raw,Path(temp),program)
                counts.append(sum(len(c['scans']) for c in channels))
                json.dumps(channels,allow_nan=False)
        assert len(files)==15 and counts==[10]*15, counts
        print('PASS: all 15 real RAWs read using production importer; 150 spectra, finite JSON.')
    unittest.main()
