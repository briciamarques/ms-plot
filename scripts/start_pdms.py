"""Start the local PD-MS workspace with diagnostics and an up-to-date build."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
ADDRESS = 'http://127.0.0.1:8765'

def node_path():
    installed = shutil.which('node')
    bundled = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    return installed or (str(bundled) if bundled.is_file() else None)

def status():
    try:
        with urllib.request.urlopen(ADDRESS + '/api/site/status', timeout=2) as response:
            data = json.load(response)
            recognized = data.get('app') == 'PD-MS Plot Builder' and data.get('mode') == 'txt-editor'
            return data if recognized else None
    except (OSError, ValueError):
        return None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Print diagnostics without starting or opening anything')
    args = parser.parse_args()
    node = node_path()
    dependencies = (ROOT / 'node_modules/vite/bin/vite.js').is_file()
    print('PD-MS workspace:', ROOT)
    print('Python:', sys.version.split()[0])
    print('Node:', node or 'missing — install Node.js')
    print('Site dependencies:', 'ready' if dependencies else 'missing — run pnpm install')
    print('Input: TXT averages and tables; no vendor RAW reader required')
    print('Address:', ADDRESS)
    if args.check:
        return 0
    if not node or not dependencies:
        return 1
    sources = [*ROOT.joinpath('src').rglob('*'), *ROOT.joinpath('public').rglob('*'), ROOT / 'index.html', ROOT / 'package.json', ROOT / 'vite.config.ts']
    built = ROOT / 'dist/index.html'
    if not built.exists() or any(path.is_file() and path.stat().st_mtime > built.stat().st_mtime for path in sources):
        print('Building the latest site…', flush=True)
        for command in ([node, 'node_modules/typescript/bin/tsc', '-b'], [node, 'node_modules/vite/bin/vite.js', 'build']):
            if subprocess.run(command, cwd=ROOT).returncode:
                print('Build failed; the previous site was not opened.')
                return 1
    current = status()
    if current is None:
        logs = ROOT / 'node_modules/.tmp'
        logs.mkdir(parents=True, exist_ok=True)
        with (logs / 'pdms-site.log').open('a', encoding='utf-8') as log:
            process = subprocess.Popen([sys.executable, str(ROOT / 'scripts/site_server.py')], cwd=ROOT, stdout=log, stderr=log,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        for _ in range(30):
            current = status()
            if current is not None:
                break
            if process.poll() is not None:
                break
            time.sleep(.2)
        if current is None:
            print('Could not start the site. Port 8765 may already be used by an older reader or server. Close it and retry.')
            print('Diagnostics:', logs / 'pdms-site.log')
            return 1
    print('Opening PD-MS Plot Builder. The local site stays running in the background.')
    webbrowser.open(ADDRESS)
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
