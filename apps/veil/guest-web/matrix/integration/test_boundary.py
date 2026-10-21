"""Staging startup gates; real admission is exercised by the SDK HTTP harness."""
import asyncio
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from provider import Boundary


class BoundaryStartup(unittest.TestCase):
    def test_second_worker_cannot_bypass_process_lock(self):
        with tempfile.TemporaryDirectory() as runtime:
            first=Boundary(runtime)
            try:
                with self.assertRaisesRegex(RuntimeError, 'one staging'):
                    Boundary(runtime)
            finally:
                asyncio.run(first.stop(None))
            # OS lock released on clean shutdown; durable database can reopen.
            next_worker=Boundary(runtime)
            asyncio.run(next_worker.stop(None))

    def test_optimized_python_cannot_remove_admission_checks(self):
        result=subprocess.run([sys.executable,'-O','-c','import provider'],
                              cwd=Path(__file__).parent,capture_output=True)
        self.assertNotEqual(result.returncode,0)
        self.assertIn(b'validation-enabled Python',result.stderr)


if __name__=='__main__':unittest.main()
