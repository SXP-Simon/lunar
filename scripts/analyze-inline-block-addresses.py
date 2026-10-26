import json
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
report = root / 'reports/inline-block-addresses'
read = lambda name: json.loads((report / name).read_text(encoding='utf-8'))
device = read('device.json')
assert device['request']['bookId'] == '433bd7f6670e435dd4aa5dbda142391a8e44290df9c88f721df94222dfce57bf'
assert device['hit']['text'] == '盒内文字'
before = next(hit for hit in device['relatedHits'] if hit['text'] == '外前')
assert before['textRange']['start'] == device['hit']['textRange']['start']
assert len(device['rects']) == 2
prefix_paint = next(paint for paint in device['paint'] if paint['text'] == '外前')
assert any(rect['bounds']['x'] == prefix_paint['rect']['x'] and rect['bounds']['width'] == prefix_paint['rect']['width'] for rect in device['rects'])
checks = (report / 'checks.log').read_text(encoding='utf-8')
assert 'FAILED' not in checks
groups = re.findall(r'test result: ok\. (\d+) passed; 0 failed; (\d+) ignored;', checks)
assert (sum(int(passed) for passed,_ in groups),sum(int(ignored) for _,ignored in groups)) == (1019,8)
assert 'test result: FAILED. 0 passed; 3 failed;' in (report / 'baseline-tests.log').read_text(encoding='utf-8')
assert read('source-audit.json')['trackedFilesVerified'] == read('baseline-source-audit.json')['trackedFilesVerified'] == 1553
build = read('build.json')
assert build['sameTestSource'] and build['baselineProductionUnchanged']
summary = {'deviceRangeIncludesPrecedingText':True,'negativeRegressions':3,'workspaceTestsPassed':1019,
    'workspaceTestsIgnored':8,'androidUpdatedKernelAdopted':False}
(report / 'summary.json').write_text(json.dumps(summary,indent=2) + '\n',encoding='utf-8',newline='\n')
print(json.dumps(summary))
