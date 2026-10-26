import json
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
report = root / 'reports/vertical-image-constraints'
read = lambda name: json.loads((report / name).read_text(encoding='utf-8'))
base = read('paint-only-native.json')
fixed = read('dev-fixed-native.json')
assert base['sampleSha256'] == fixed['sampleSha256'] == '433bd7f6670e435dd4aa5dbda142391a8e44290df9c88f721df94222dfce57bf'
assert base['decoderSha256'] == fixed['decoderSha256']
changes = []
for before, after in zip(base['results'], fixed['results'], strict=True):
    assert before['chapter'] == after['chapter']
    assert before['pageText'] == after['pageText']
    assert before['paintedText'] == after['paintedText']
    assert before['imageCount'] == after['imageCount'] == 2
    if after['chapter'] == 'horizontal':
        assert before['displaySha256'] == after['displaySha256']
        assert before['commands'] == after['commands']
    else:
        assert before['images'][0]['dest']['width'] == 32
        assert before['images'][0]['dest']['height'] == 21.328125
    for image in after['images']:
        rect = image['dest']
        assert (rect['width'], rect['height']) == (48, 32), rect
        assert 0 <= rect['x'] <= 411 - rect['width']
        assert 0 <= rect['y'] <= 914 - rect['height']
    changes.append({'chapter':after['chapter'], 'before':[image['dest'] for image in before['images']], 'after':[image['dest'] for image in after['images']]})

browser = read('browser-control.json')
for page in browser['pages']:
    for image in page['images']:
        rect = image['rect']
        if image['kind'].startswith('fixed'):
            assert (rect['width'], rect['height']) == (30, 20)
        else:
            assert rect['width'] == page['width'] / 2
checks = (report / 'checks.log').read_text(encoding='utf-8')
assert 'FAILED' not in checks
results = re.findall(r'test result: ok\. (\d+) passed; 0 failed; (\d+) ignored;', checks)
assert results
passed, ignored = (sum(int(result[i]) for result in results) for i in range(2))
assert (passed, ignored) == (1019, 8), (passed, ignored)
baseline = (report / 'baseline-regressions.log').read_text(encoding='utf-8')
assert 'test result: FAILED. 0 passed; 3 failed;' in baseline
build = read('build.json')
assert build['trackedFilesVerified'] > 1500
audit = read('baseline-source-audit.json')
assert audit['productionUnchangedFromDev'] and audit['finalTestSourceIdentical']
summary = {
    'workspaceTestsPassed':passed,
    'workspaceTestsIgnored':ignored,
    'baselineRegressionsFailed':3,
    'horizontalPaintUnchanged':True,
    'pageTextUnchanged':True,
    'nativeCompositionIncludesPaintFix':True,
    'androidFixedKernelAdopted':False,
    'changes':changes,
}
(report / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Verified physical image constraints, native composition, unchanged horizontal paint/text, and 3 negative regressions.')
