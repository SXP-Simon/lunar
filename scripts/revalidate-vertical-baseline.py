"""Run only PR46's regression tests against unchanged baseline production code.

Run on Linux after revalidate-search-vertical.sh has saved all three binaries:
python3 revalidate-vertical-baseline.py BASE_EXPORT FIXED_EXPORT TARGET_DIR OUTPUT
The temporary test-only instrumentation is restored even if compilation fails.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

base, fixed, target, output = map(lambda p: Path(p).resolve(), sys.argv[1:])
paths = [
    Path('crates/rito-core/src/runtime/tests.rs'),
    Path('crates/rito-core/src/runtime/tests/vertical_interaction_tests.rs'),
    Path('crates/rito-core/src/runtime/reader_session/interaction_tests.rs'),
]
original = {p: (base / p).read_bytes() if (base / p).exists() else None for p in paths}
env = dict(os.environ, CARGO_TARGET_DIR=str(target), CARGO_BUILD_JOBS='2')
output.mkdir(parents=True, exist_ok=True)
try:
    for p in paths:
        (base / p).write_bytes((fixed / p).read_bytes())
    subprocess.run(['cargo', '+1.95.0', 'clean', '--workspace'], cwd=base, env=env, check=True)
    result = subprocess.run([
        'cargo', '+1.95.0', 'test', '--locked', '-p', 'rito-core',
        'vertical_interaction', '--', '--nocapture',
    ], cwd=base, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (output / 'vertical-baseline-regressions.log').write_bytes(result.stdout)
    log = result.stdout.decode('utf-8')
    assert result.returncode == 101, (result.returncode, log[-2000:])
    assert re.search(r'test result: FAILED\. 0 passed; 6 failed; 0 ignored;', log), log[-3000:]
    record = {
        'exitCode': result.returncode, 'passed': 0, 'failed': 6,
        'productionCodeChanged': False, 'testInstrumentationRestored': True,
        'testFilesSha256': {str(p): hashlib.sha256((fixed / p).read_bytes()).hexdigest()
                            for p in paths},
    }
    (output / 'vertical-baseline-regressions.json').write_text(
        json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(record, indent=2))
finally:
    for p, content in original.items():
        if content is None:
            (base / p).unlink(missing_ok=True)
        else:
            (base / p).write_bytes(content)
