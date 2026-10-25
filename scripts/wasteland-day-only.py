"""Isolate alternate-stylesheet selection from embedded OTF font rendering.

Derived from the unmodified IDPF 20230704 sample in samples/. Keeps all
attribution, font licenses, resources, and CSS. Removes only the active
alternate stylesheet link in the content and navigation XHTML documents.
"""
from pathlib import Path
import re
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / 'samples/wasteland-otf.epub'
target = root / 'samples/wasteland-otf-day-only.epub'
changed = []
with zipfile.ZipFile(source) as original, zipfile.ZipFile(target, 'w') as output:
    for info in original.infolist():
        data = original.read(info.filename)
        if info.filename.endswith('.xhtml'):
            data, count = re.subn(rb'<link rel="alternate stylesheet"[^>]+/>', b'', data)
            if count:
                changed.append((info.filename, count))
        output.writestr(info, data)
assert changed == [('EPUB/wasteland-content.xhtml', 1), ('EPUB/wasteland-nav.xhtml', 1)], changed
print(target)
