"""Check saved Android evidence, not a substitute for rerunning the app.

Requires Pillow to independently check the two original screenshots.
"""
import argparse
import hashlib
import json
from pathlib import Path
import statistics
import subprocess

from PIL import Image, ImageChops

parser = argparse.ArgumentParser()
parser.add_argument('--lunar-root', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
report = root / 'reports/reader-session-reflow'
load = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
summary = load(report / 'summary.json')
for path, expected in summary['copiedFileSha256'].items():
    assert hashlib.sha256((root / path).read_bytes()).hexdigest() == expected, path
assert hashlib.sha256((root / 'samples/moby-dick.epub').read_bytes()).hexdigest() == '81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4'
if args.lunar_root:
    for path, expected in summary['sourceFileSha256'].items():
        source = subprocess.check_output(['git', '-C', str(args.lunar_root), 'show', summary['sourceCommit'] + ':' + path])
        assert hashlib.sha256(source).hexdigest() == expected, path
trials = load(report / 'formal-trials.json')
assert len(trials) == 6
assert len({row['pid'] for row in trials}) == 6
assert [(r['round'], r['label']) for r in trials] == [(n, label) for n in (1, 2, 3) for label in ('baseline', 'fixed')]
for row in trials:
    label, number = row['label'], row['round']
    raw = load(report / f'{label}-{number}.json')['result']['value']
    assert raw['status'] == 'done'
    assert row == {'round': number, 'label': label, 'commit': row['commit'], 'pid': row['pid'], **raw['value']}
    fixed = label == 'fixed'
    assert row['commit'] == summary['sourceCommit' if fixed else 'baselineCommit']
    assert row['status'] == 'done' and row['supportsReflow'] is fixed
    assert row['afterReflows']['reads'] == (1 if fixed else 4)
    assert row['afterReflows']['opens'] == (1 if fixed else 4)
    assert len(row['reflows']) == len(row['fresh']) == 3
    for frame, fresh in zip(row['reflows'], row['fresh']):
        assert frame['text'] == fresh['text']
        assert frame['semanticDigest'] == fresh['semanticDigest']
        assert frame['geometry'] == fresh['geometry']
        assert frame['geometry']['selectedText'] == 'Ishmael' and frame['geometry']['rects']
        assert all(fresh[key] for key in ('sameText', 'sameSemanticDigest', 'sameGeometry'))
        assert all(frame[key] is fixed for key in ('retainedSession', 'retainedFontRegistry', 'retainedImageCache'))
        if fixed:
            assert frame['liveArtifacts'] == 1
    assert row['coverAfter']['images'] and row['coverAfter']['images'] == row['coverFresh']['images']
    assert row['coverAfter']['semanticDigest'] == row['coverFresh']['semanticDigest']
    assert [f['snapshot']['position']['locator']['manifestHref'] for f in row['boundaryTurns']] == ['chapter_002.xhtml', 'chapter_001.xhtml'] * 2
for number in (1, 2, 3):
    baseline = next(r for r in trials if r['round'] == number and r['label'] == 'baseline')
    fixed = next(r for r in trials if r['round'] == number and r['label'] == 'fixed')
    for before, after in zip(baseline['reflows'], fixed['reflows']):
        assert all(before[key] == after[key] for key in ('text', 'semanticDigest', 'geometry'))
    assert baseline['coverAfter']['images'] == fixed['coverAfter']['images']
for name, values in summary['durations'].items():
    for label, value in values.items():
        runs = [[r['durationMs'] for r in trial['records'] if r.get('name') == name] for trial in trials if trial['label'] == label]
        assert value['runsMs'] == runs
        assert value['medianMs'] == statistics.median(v for run in runs for v in run)
cold = load(report / 'cold-profile/trials.json')
assert len(cold) == 6 and len({row['pid'] for row in cold}) == 6
assert len({row['semanticDigest'] for row in cold}) == 1
for row in cold:
    raw = load(report / f'cold-profile/{row["label"]}-{row["round"]}.json')['result']['value']
    assert raw['status'] == 'done' and raw['value']['status'] == 'done'
    assert row['phase'] == 'ready'
    assert abs(row['stats']['totalMs'] - sum(row['stats'][key] for key in ('readMs', 'backendMs', 'pictureMs', 'otherMs'))) < 0.001
for name in ('settings-restored.json', 'cold-profile/settings-restored.json'):
    assert load(report / name)['result']['value'] == {'before': False, 'restored': True}
for name in ('reflow-ui-positioned.json', 'reflow-ui-24.json', 'reflow-ui-20.json'):
    frame = load(report / 'ui' / name)['result']['value']['value']
    assert frame['sameSession'] and frame['geometry']['rects'] and frame['geometry']['selectedText'] == 'Ishmael'
restored = load(report / 'ui/reflow-ui-restored.json')['result']['value']['value']
before = load(report / 'ui/reflow-ui-before.json')['result']['value']['value']
assert restored['typography'] == before['previousTypography']
assert restored['phaseAfterExit'] == 'idle'
assert restored['restored']['geometry'] == load(report / 'ui/reflow-ui-positioned.json')['result']['value']['value']['geometry']
crop = (0, 310, 1080, 2200)
with Image.open(report / 'ui/reflow-ui-pixel-fast.png') as a, Image.open(report / 'ui/reflow-ui-pixel-fresh.png') as b:
    assert ImageChops.difference(a.convert('RGB').crop(crop), b.convert('RGB').crop(crop)).getbbox() is None
assert load(report / 'ui/reflow-ui-pixel-comparison.json')['samePixels'] is True
middle = load(report / 'middle-position.json')['result']['value']
assert middle['status'] == 'done' and middle['value']['status'] == 'done'
old, reflowed, reopened = middle['value']['steps']
assert old['snapshot']['position']['pageIndex'] == 5
assert reflowed['snapshot']['position']['pageIndex'] == reopened['snapshot']['position']['pageIndex'] == 10
assert old['sessionId'] == reflowed['sessionId'] != reopened['sessionId']
assert reflowed['geometry'] == reopened['geometry']
assert all(step['geometry']['selectedText'] == 'phantom' and step['geometry']['rects'] for step in (old, reflowed, reopened))
matrix = load(report / 'layout-matrix.json')['result']['value']
assert matrix['status'] == 'done' and matrix['value']['status'] == 'done'
assert [case['name'] for case in matrix['value']['cases']] == ['double', 'viewport', 'spacing']
for case in matrix['value']['cases']:
    assert case['matched']
    a, b = case['reflowed'], case['fresh']
    assert a['sessionId'] != b['sessionId']
    assert all(a[key] == b[key] for key in ('text', 'semanticDigest', 'geometry'))
assert load(report / 'final-settings.json')['result']['value'] == {'before': True, 'restored': True}
assert '32 passed (32)' in (report / 'checks/targeted-tests.log').read_text(encoding='utf-8-sig')
assert '547 passed (547)' in (report / 'checks/full-tests.log').read_text(encoding='utf-8-sig')
assert '1 failed | 1 passed | 30 skipped (32)' in (report / 'checks/final-baseline-negative.log').read_text(encoding='utf-8-sig')
print(json.dumps({'runtimeTrials': 6, 'coldProfiles': 6, 'uiHighlight': 'verified', 'sameReaderPixels': True, 'copiedFiles': len(summary['copiedFileSha256']), 'sourceFiles': len(summary['sourceFileSha256'])}))
