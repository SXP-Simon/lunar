"""Inspect original EPUB XML independently of Lunar; create two controlled variants."""
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = {'ocf': 'urn:oasis:names:tc:opendocument:xmlns:container', 'opf': 'http://www.idpf.org/2007/opf', 'dc': 'http://purl.org/dc/elements/1.1/'}
SOURCE = ROOT / 'samples/moby-dick.epub'

def variant(name, transform):
    target = ROOT / 'samples' / name
    with zipfile.ZipFile(SOURCE) as src, zipfile.ZipFile(target, 'w') as dst:
        for info in src.infolist():
            data = src.read(info.filename)
            dst.writestr(info, transform(info.filename, data))

def whitespace(path, data):
    if path == 'META-INF/container.xml':
        return data.replace(b'full-path=', b'full-path = ')
    return data

def prefix(path, data):
    if path.endswith('.opf'):
        # Only qualify the default-OPF elements. Keep metadata text and all resources unchanged.
        text = data.decode('utf-8').replace('xmlns="http://www.idpf.org/2007/opf"', 'xmlns:opf="http://www.idpf.org/2007/opf"')
        text = re.sub(r'<(/?)(package|metadata|manifest|item|spine|itemref|meta|link|guide|reference|bindings|mediaType|collection)(?=[\s/>])', r'<\1opf:\2', text)
        return text.encode('utf-8')
    return data

variant('moby-dick-attribute-whitespace.epub', whitespace)
variant('moby-dick-opf-prefix.epub', prefix)
rows = []
for path in sorted((ROOT / 'samples').glob('*.epub')):
    with zipfile.ZipFile(path) as z:
        container = ET.fromstring(z.read('META-INF/container.xml'))
        package_path = container.find('ocf:rootfiles/ocf:rootfile', NS).get('full-path')
        package = ET.fromstring(z.read(package_path))
        metadata = package.find('opf:metadata', NS)
        manifest = package.find('opf:manifest', NS)
        spine = package.find('opf:spine', NS)
        css = '\n'.join(z.read(n).decode('utf-8', errors='replace') for n in z.namelist() if n.endswith('.css'))
        docs = '\n'.join(z.read(n).decode('utf-8', errors='replace') for n in z.namelist() if n.endswith(('.xhtml', '.html')))
        rows.append({
            'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'source': 'moby-dick.epub (controlled XML-only variation)' if path.name in ('moby-dick-attribute-whitespace.epub', 'moby-dick-opf-prefix.epub') else 'https://github.com/IDPF/epub3-samples/releases/download/20230704/' + path.name,
            'archiveBytes': path.stat().st_size, 'inflatedBytes': sum(i.file_size for i in z.infolist()),
            'entryCount': len(z.infolist()), 'packagePath': package_path,
            'title': metadata.findtext('dc:title', namespaces=NS),
            'creators': [e.text for e in metadata.findall('dc:creator', NS)],
            'rights': [e.text for e in metadata.findall('dc:rights', NS)],
            'renditionMetadata': [{'property': e.get('property'), 'text': e.text} for e in metadata.findall('opf:meta', NS) if (e.get('property') or '').startswith('rendition:')],
            'spineDirection': spine.get('page-progression-direction'),
            'spineOverrides': [dict(e.attrib) for e in spine if 'rendition:layout' in e.get('properties', '')],
            'spineCount': len(spine), 'fontResources': [dict(e.attrib) for e in manifest if 'font' in e.get('media-type', '') or e.get('href', '').endswith(('.otf','.ttf','.woff'))],
            'encryptedResources': 'META-INF/encryption.xml' in z.namelist(),
            'featureOccurrences': { 'fontFace': css.count('@font-face'), 'writingMode': css.count('writing-mode'), 'ruby': len(re.findall(r'<ruby\b', docs)), 'table': len(re.findall(r'<table\b', docs)), 'float': len(re.findall(r'float\s*:', css)), 'columns': len(re.findall(r'column-(?:count|width)\s*:', css)) },
        })
(ROOT / 'reports/source-analysis.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps([{'file': x['file'], 'layout': x['renditionMetadata'], 'spineOverrides': len(x['spineOverrides']), 'rights': x['rights']} for x in rows], ensure_ascii=False, indent=2))
