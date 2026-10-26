"""CC0 long-flow control: annotations must follow source text across reflow."""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json

root = Path(__file__).resolve().parents[1]
source = root / 'samples/vertical-inline-block-probe.epub'
target = root / 'samples/vertical-composition-probe.epub'
with ZipFile(source) as before, ZipFile(target, 'w') as after:
    for entry in before.infolist():
        data = before.read(entry.filename)
        if entry.filename.endswith(('horizontal.xhtml', 'vertical.xhtml', 'prefixed.xhtml')):
            text = data.decode()
            text = text.replace('<body>', '<body><p>' + '春夏秋冬山川日月星辰' * 27 + '</p>')
            text = text.replace('<p>外前', '<p id="boxed">外前')
            text = text.replace('<p>嵌前', '<p id="nested">嵌前')
            text = text.replace('</body>', '<p id="ruby">注前<span class="box"><ruby><rb>山道</rb><rt>さんどう</rt></ruby></span>注後</p></body>')
            data = text.encode()
        elif entry.filename.endswith('package.opf'):
            data = data.replace(b'urn:lunar:cc0:vertical-inline-block:1', b'urn:lunar:cc0:vertical-composition:1')
            data = data.replace(b'Lunar Vertical Inline Block Probe', b'Lunar Vertical Composition Probe')
        after.writestr(entry, data)
print(json.dumps({'sha256':hashlib.sha256(target.read_bytes()).hexdigest(), 'bytes':target.stat().st_size, 'prefixCharacters':270}))
