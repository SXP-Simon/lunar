"""Byte-compare every tracked ordinary file with a Git commit's LF archive.

Usage: python verify-rito-export.py REPO COMMIT SOURCE_DIRECTORY OUTPUT_JSON
The source may be a Linux directory or a WSL UNC path. Temporary, untracked
probe examples are outside the tracked-file comparison and must be identified.
"""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile

repo,commit,source,out=sys.argv[1:]
source=Path(source)
archive=subprocess.check_output(['git','-C',repo,'-c','core.autocrlf=false','archive',commit])
digest=hashlib.sha256()
count=0
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    for entry in tar:
        if not entry.isfile():continue
        expected=tar.extractfile(entry).read()
        assert (source/entry.name).read_bytes()==expected,entry.name
        digest.update(entry.name.encode()+b'\0'+hashlib.sha256(expected).digest())
        count+=1
record={'commit':commit,'allTrackedOrdinaryFilesMatchGitBytes':True,
        'filesVerified':count,'contentManifestSha256':digest.hexdigest(),
        'method':'git -c core.autocrlf=false archive COMMIT'}
Path(out).write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
print(json.dumps(record,indent=2))
