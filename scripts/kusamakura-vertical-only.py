"""Isolate vertical layout from the known alternate-stylesheet rejection.

Derived from the IDPF CC0 sample. All text, CSS, media, attribution and
licenses are unchanged; only inactive horizontal stylesheet links are removed.
"""
import hashlib
import json
from pathlib import Path
import re
from zipfile import ZipFile

root = Path(__file__).resolve().parents[1]
source = root / 'samples/kusamakura-japanese-vertical-writing.epub'
target = root / 'samples/kusamakura-vertical-only.epub'
changed = []
with ZipFile(source) as original, ZipFile(target, 'w') as output:
    for info in original.infolist():
        data = original.read(info.filename)
        if info.filename.endswith('.xhtml'):
            data, count = re.subn(
                rb'<link\b(?=[^>]*\brel="alternate stylesheet")(?=[^>]*\bhref="../css/horizontal.css")[^>]*\s*/>',
                b'', data,
            )
            if count:
                changed.append({'path': info.filename, 'removedLinks': count})
        output.writestr(info, data)
assert len(changed) == 16 and all(c['removedLinks'] == 1 for c in changed)
report = {
    'source': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'variant': target.name, 'variantSha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'mutation': 'Remove only alternate horizontal.css link elements; retain vertical CSS, all other resources and source attribution',
    'changes': changed,
}
(root / 'reports/kusamakura-control-source.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8',
)
print(target)
