"""The website may only trigger a fixed launcher, never URL-derived commands."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('site_button', Path(__file__).resolve().parents[1] / 'scripts/site_button.py')
button = importlib.util.module_from_spec(spec)
spec.loader.exec_module(button)


class Key:
    def __init__(self, path): self.path = path
    def __enter__(self): return self
    def __exit__(self, *args): pass


class RegistrationTests(unittest.TestCase):
    def setUp(self):
        self.data = {}
        def create(root, path):
            parts = path.split('\\')
            for i in range(1, len(parts) + 1): self.data.setdefault('\\'.join(parts[:i]), {})
            return Key(path)
        def open_key(root, path):
            if path not in self.data: raise FileNotFoundError(path)
            return Key(path)
        self.registry = types.SimpleNamespace(HKEY_CURRENT_USER='current-user', REG_SZ=1,
            CreateKey=create, OpenKey=open_key,
            SetValueEx=lambda key, name, reserved, kind, value: self.data[key.path].__setitem__(name, value),
            QueryValueEx=lambda key, name: (self.data[key.path][name], 1),
            DeleteKey=lambda root, path: self.data.pop(path))

    def test_fixed_command_quotes_paths_and_omits_url(self):
        command = button.launch_command('C:/Program Files/Python/python.exe', 'C:/Research Projects/MS Plot/site_button.py')
        self.assertIn('"C:/Research Projects/MS Plot/site_button.py" --open', command)
        self.assertNotIn('%1', command)
        self.assertNotIn('cmd.exe', command)

    def test_registration_is_idempotent_and_reversible(self):
        with patch.dict(sys.modules, winreg=self.registry):
            button.register()
            snapshot = {key: dict(value) for key, value in self.data.items()}
            button.register()
            self.assertEqual(snapshot, self.data)
            self.assertEqual(self.data[button.REGISTRY_KEY]['URL Protocol'], '')
            self.assertTrue(self.data[button.REGISTRY_KEY + r'\shell\open\command'][''].endswith(' --open'))
            button.unregister()
            self.assertNotIn(button.REGISTRY_KEY, self.data)

    def test_does_not_overwrite_or_remove_another_installation(self):
        key = button.REGISTRY_KEY + r'\shell\open\command'
        self.data[key] = {'': 'other installation'}
        with patch.dict(sys.modules, winreg=self.registry):
            with self.assertRaises(RuntimeError): button.register()
            with self.assertRaises(RuntimeError): button.unregister()
        self.assertEqual(self.data[key][''], 'other installation')

    def test_no_url_parameters_accepted(self):
        with patch.object(sys, 'argv', ['site_button.py', '--open', 'pdmsplot://malicious-command']):
            with self.assertRaises(SystemExit) as error: button.main()
        self.assertEqual(error.exception.code, 2)


if __name__ == '__main__':
    unittest.main()
