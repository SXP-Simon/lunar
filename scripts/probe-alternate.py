"""Run Rito's real chapter-fragment-probe on unchanged public EPUB samples.

Run in the Linux host used to build the probe. This exercises production
EPUB parsing, Stylo and native layout; it is not an Android screenshot test.
"""
import argparse
import hashlib
import json
from pathlib import Path
import posixpath
import subprocess
import xml.etree.ElementTree as ET
from zipfile import ZipFile

parser = argparse.ArgumentParser()
parser.add_argument('--probe', required=True)
parser.add_argument('--source', required=True)
parser.add_argument('--label', required=True)
parser.add_argument('--commit', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
source = Path(args.source).resolve()
fonts = source / 'apps/reader/src/assets/fonts'
results = []
for name in ['wasteland-otf.epub', 'wasteland-otf-day-only.epub', 'kusamakura-japanese-vertical-writing.epub']:
    path = root / 'samples' / name
    with ZipFile(path) as archive:
        container = ET.fromstring(archive.read('META-INF/container.xml'))
        opf_path = next(n for n in container.iter() if n.tag.endswith('rootfile')).get('full-path')
        package = ET.fromstring(archive.read(opf_path))
        manifest = {n.get('id'): n.get('href') for n in package.iter() if n.tag.endswith('}item')}
        chapters = []
        for item in package.iter():
            if not item.tag.endswith('itemref'):
                continue
            if name == 'kusamakura-japanese-vertical-writing.epub' and item.get('idref') != '一':
                continue
            href = posixpath.normpath(posixpath.join(posixpath.dirname(opf_path), manifest[item.get('idref')]))
            document = ET.fromstring(archive.read(href))
            links = [n.attrib for n in document.iter() if n.tag.endswith('}link') and 'stylesheet' in n.get('rel', '').lower().split()]
            if len(links) > 1 or name == 'wasteland-otf-day-only.epub':
                chapters.append({'idref': item.get('idref'), 'href': href, 'links': links})
                break
    request = {
        'epubPath': str(path),
        'fontPaths': [str(fonts / 'Tinos-Regular.ttf'), str(fonts / 'SourceHanSerifCN-Regular.otf')],
        'contentWidthPx': 372,
        'fragmentainerSize': 592,
        'chapterIdrefs': [c['idref'] for c in chapters],
    }
    run = subprocess.run([args.probe], input=json.dumps(request), text=True, capture_output=True, timeout=180)
    result = {
        'file': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'sources': chapters, 'request': request, 'exitCode': run.returncode,
        'stderr': run.stderr, 'stdout': run.stdout,
    }
    if run.returncode == 0:
        result['output'] = json.loads(result.pop('stdout'))
    results.append(result)
    print(name, 'exit', run.returncode, flush=True)
report = {
    'label': args.label,
    'sourceCommit': args.commit,
    'probeSha256': hashlib.sha256(Path(args.probe).read_bytes()).hexdigest(),
    'rustVersion': subprocess.check_output(['rustc', '+1.95.0', '--version'], text=True).strip(),
    'results': results,
}
(root / 'reports' / (args.label + '.json')).write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
