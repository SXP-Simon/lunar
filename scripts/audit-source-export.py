"""Verify raw source bytes in a disposable export against its Git archive."""
from pathlib import Path
import hashlib
import json
import sys
import tarfile

archive = Path(sys.argv[1])
target = Path(sys.argv[2])
output = Path(sys.argv[3])
entries = []
with tarfile.open(archive) as files:
    for name in sorted({entry.name for entry in files if entry.isfile()}):
        expected = files.extractfile(name).read()
        assert (target / name).read_bytes() == expected, name
        entries.append(name + '\0' + hashlib.sha256(expected).hexdigest())
result = {
    'trackedFilesVerified':len(entries),
    'manifestSha256':hashlib.sha256('\n'.join(entries).encode()).hexdigest(),
    'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
}
output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps(result))
