"""Register a per-user Windows link that opens the fixed local PD-MS launcher.

The protocol never forwards URLs or other website-supplied arguments to Python.
"""
import argparse
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_KEY = r'Software\Classes\pdmsplot'


def launch_command(executable=None, script=None):
    executable = Path(executable or sys.executable)
    gui = executable.with_name('pythonw.exe')
    if gui.is_file():
        executable = gui
    return f'"{executable}" "{script or Path(__file__).resolve()}" --open'


def register():
    import winreg
    command = launch_command()
    command_key = REGISTRY_KEY + r'\shell\open\command'
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, command_key) as key:
            existing = winreg.QueryValueEx(key, '')[0]
        if existing != command:
            raise RuntimeError('The pdmsplot link is already registered to another location. Remove that registration before moving the app.')
    except FileNotFoundError:
        pass
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, REGISTRY_KEY) as key:
        winreg.SetValueEx(key, '', 0, winreg.REG_SZ, 'URL:PD-MS Plot Builder')
        winreg.SetValueEx(key, 'URL Protocol', 0, winreg.REG_SZ, '')
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, command_key) as key:
        winreg.SetValueEx(key, '', 0, winreg.REG_SZ, command)
    print('Botao do site ativado para este usuario do Windows. Volte ao site e clique em Iniciar leitor e abrir versao local.')


def unregister():
    import winreg
    command_key = REGISTRY_KEY + r'\shell\open\command'
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, command_key) as key:
            if winreg.QueryValueEx(key, '')[0] != launch_command():
                raise RuntimeError('This registration belongs to another installation; it was kept.')
    except FileNotFoundError:
        return
    for suffix in [r'\shell\open\command', r'\shell\open', r'\shell', '']:
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, REGISTRY_KEY + suffix)
    print('Botao do site desativado. Start-PDMS.cmd continua funcionando.')


def open_workspace():
    log_path = ROOT / 'node_modules/.tmp/pdms-site-button.log'
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        python = Path(sys.executable).with_name('python.exe')
        with log_path.open('a', encoding='utf-8') as log:
            result = subprocess.run([str(python), str(ROOT / 'scripts/start_pdms.py')], cwd=ROOT,
                                    stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode:
            raise RuntimeError('O leitor nao conseguiu iniciar.')
    except Exception as error:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None,
            f'{error}\n\nAbra a pasta {ROOT} e de dois cliques em Start-PDMS.cmd para ver o erro.\n\nRegistro: {log_path}',
            'PD-MS: ajuda para abrir o leitor', 0x10)
        return 1
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--install', action='store_true')
    action.add_argument('--uninstall', action='store_true')
    action.add_argument('--open', action='store_true')
    args = parser.parse_args()
    if os.name != 'nt':
        parser.error('The site button requires Windows. Use the local reader directly on other systems.')
    if args.open:
        return open_workspace()
    if args.install:
        register()
    else:
        unregister()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
