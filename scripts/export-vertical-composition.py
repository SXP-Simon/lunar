"""Export an audited temporary composition; never merge or change the source checkout."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

kernel = Path(sys.argv[1]).resolve()
archive = Path(sys.argv[2]).resolve()
base = 'ed0284f3703244da28b3e6efd80cf29267cf6e65'
commits = [
    '5fa3f60e4b702eb7aa89c025ee890d0c4fb62053',
    'dbef76cdf15dabd48bb83d03f3c2ddf82b263b9e',
    '123a1fbebb7ca00c34f1aded03a390eef0309527',
    '1b3031defde326d83e2c8e80269791e339f1fc19',
]
if '--without-address-fix' in sys.argv:
    commits = commits[:-1]

def git(*args):
    return subprocess.check_output(['git', '-c', 'core.autocrlf=false', '-C', str(kernel), *args])

def blob(commit, name):
    result = subprocess.run(['git', '-C', str(kernel), 'show', f'{commit}:{name}'], capture_output=True)
    return result.stdout if result.returncode == 0 else b''

changed = {}
resolutions = []
for commit in commits:
    for name in git('diff', '--name-only', base, commit).decode().splitlines():
        incoming = blob(commit, name)
        ancestor = blob(base, name)
        current = changed.get(name, ancestor)
        if current == ancestor:
            changed[name] = incoming
            continue
        with tempfile.TemporaryDirectory() as temporary:
            paths = [Path(temporary) / label for label in ['current', 'base', 'incoming']]
            for path, data in zip(paths, [current, ancestor, incoming], strict=True):
                path.write_bytes(data)
            command = ['git', 'merge-file', '-p', *(str(path) for path in paths)]
            result = subprocess.run(command, capture_output=True)
            if result.returncode == 1 and name == 'crates/rito-core/src/runtime/tests.rs':
                result = subprocess.run(['git', 'merge-file', '-p', '--union', *(str(path) for path in paths)], capture_output=True)
                lines = result.stdout.decode().splitlines()
                declarations = [line for line in lines if line.startswith('mod ')]
                assert len(declarations) == len(set(declarations))
                merged = result.stdout.replace(
                    b'mod vertical_interaction_tests;\nmod vertical_inline_block_tests;',
                    b'mod vertical_inline_block_tests;\nmod vertical_interaction_tests;',
                )
                result = subprocess.CompletedProcess(result.args, result.returncode, merged, result.stderr)
                resolutions.append({'file':name, 'method':'union and alphabetize added vertical test module declarations'})
            if result.returncode:
                raise RuntimeError(f'Manual review needed: {name}\n{result.stdout.decode()}')
            changed[name] = result.stdout

archive.parent.mkdir(parents=True, exist_ok=True)
archive.write_bytes(git('archive', '--format=tar', base))
with tarfile.open(archive, 'a') as files:
    for name, data in sorted(changed.items()):
        entry = tarfile.TarInfo(name)
        entry.size = len(data)
        files.addfile(entry, io.BytesIO(data))
manifest = {'base':base, 'commits':commits, 'overlays':{name:hashlib.sha256(data).hexdigest() for name,data in sorted(changed.items())}, 'resolutions':resolutions}
archive.with_suffix('.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'files':len(changed), 'resolutions':resolutions, 'archive':str(archive)}))
