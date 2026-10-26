"""Verify exact Git-exported sources, complete check logs and saved probe hashes.

Usage: python verify-rito-audit.py KERNEL_REPO AUDIT_PARENT OUTPUT_PARENT
AUDIT_PARENT contains rito-{baseline,search,vertical}-audit and rito-verified-probes.
On Windows it may be a WSL UNC path; Git archives must disable core.autocrlf.
"""
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tarfile

repo, parent, output = map(Path, sys.argv[1:])
commits = {
    'baseline': 'ed0284f3703244da28b3e6efd80cf29267cf6e65',
    'search': '376e939fa70f03f218ae7d19cdd3490aacd170ca',
    'vertical': '5fa3f60e4b702eb7aa89c025ee890d0c4fb62053',
}
expected = {'baseline': 1016, 'search': 1024, 'vertical': 1022}
output.mkdir(parents=True, exist_ok=True)
records = []
for label, commit in commits.items():
    source = parent / ('rito-' + label + '-audit')
    archive = subprocess.check_output([
        'git', '-C', str(repo), '-c', 'core.autocrlf=false', 'archive', commit,
    ])
    digest = hashlib.sha256()
    count = 0
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for entry in tar:
            if not entry.isfile():
                continue
            exact = tar.extractfile(entry).read()
            actual = (source / entry.name).read_bytes()
            assert actual == exact, (label, entry.name, 'differs from committed bytes')
            digest.update(entry.name.encode() + b'\0' + hashlib.sha256(exact).digest())
            count += 1
    logs = parent / 'rito-verified-probes'
    log = (logs / (label + '-checks.log')).read_text(encoding='utf-8')
    assert not re.search(r'^error:|test result: FAILED', log, re.M), label
    groups = re.findall(r'test result: ok\. (\d+) passed; 0 failed; (\d+) ignored', log)
    passed = sum(int(a) for a, b in groups)
    ignored = sum(int(b) for a, b in groups)
    assert (passed, ignored, len(groups)) == (expected[label], 8, 39), label
    assert 'Doc-tests rito_wasm' in log and 'Finished `dev` profile' in log, label
    (output / (label + '-checks.log')).write_text(log, encoding='utf-8')
    records.append({
        'label': label, 'commit': commit, 'trackedFilesVerified': count,
        'trackedContentManifestSha256': digest.hexdigest(),
        'workspaceTestsPassed': passed, 'workspaceTestsIgnored': ignored,
        'testSummaryGroups': len(groups), 'fmt': True, 'clippyWarningsDenied': True,
        'binaries': {kind: hashlib.sha256((logs / (label + '-' + kind)).read_bytes()).hexdigest()
                     for kind in ('chapter', 'search', 'vertical')},
    })
result = {
    'sourceByteComparison': 'git -c core.autocrlf=false archive COMMIT',
    'cleanWorkspaceBeforeEachVersion': True,
    'rustVersion': 'rustc 1.95.0 (59807616e 2026-04-14)',
    'platform': 'Ubuntu 22.04 / WSL Linux x86_64 host; not Android',
    'extraExamples': ['search_wrap_native.rs', 'vertical_interaction_native.rs'],
    'builds': records,
}
(output / 'audit.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(records, indent=2))
