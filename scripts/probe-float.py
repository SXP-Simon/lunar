"""Probe the public Cole chapter through Rito, without RN/Skia."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
from zipfile import ZipFile

p = argparse.ArgumentParser()
p.add_argument('--probe', required=True)
p.add_argument('--source', required=True)
p.add_argument('--commit', required=True)
p.add_argument('--label', required=True)
a = p.parse_args()
root = Path(__file__).resolve().parents[1]
epub = root / 'samples/cole-voyage-of-life.epub'
with ZipFile(epub) as z:
    container = ET.fromstring(z.read('META-INF/container.xml'))
    opf = next(n.get('full-path') for n in container.iter() if n.tag.endswith('}rootfile'))
    package = ET.fromstring(z.read(opf))
    idref = next(n.get('id') for n in package.iter() if n.get('href', '').endswith('2a-youth-text.xhtml'))
fonts = Path(a.source) / 'apps/reader/src/assets/fonts'
results = []
for height in [None, 592]:
    request = {
        'epubPath': str(epub),
        'fontPaths': [str(fonts / 'Tinos-Regular.ttf')],
        'contentWidthPx': 363,
        'chapterIdrefs': [idref],
    }
    if height is not None:
        request['fragmentainerSize'] = height
    run = subprocess.run([a.probe], input=json.dumps(request), text=True,
                         capture_output=True, timeout=180)
    result = {'request': request, 'exitCode': run.returncode, 'stderr': run.stderr}
    if run.returncode == 0:
        result['output'] = json.loads(run.stdout)
    else:
        result['stdout'] = run.stdout
    results.append(result)
    print('fragmentainer', height, 'exit', run.returncode, flush=True)
report = {'sourceCommit': a.commit, 'probeSha256': hashlib.sha256(Path(a.probe).read_bytes()).hexdigest(),
          'sampleSha256': hashlib.sha256(epub.read_bytes()).hexdigest(), 'results': results}
(root / 'reports' / (a.label + '.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
