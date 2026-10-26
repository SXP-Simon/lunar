"""Check raw ReaderSession results against source XHTML and original paint."""
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

root = Path(__file__).resolve().parents[1]
out = root / 'reports/vertical-composition'
read = lambda name: json.loads((out / name).read_text(encoding='utf-8'))
result = read('interaction.json')
assert 'failure' not in result
sample = root / 'samples/vertical-composition-probe.epub'
assert hashlib.sha256(sample.read_bytes()).hexdigest() == result['sampleSha256']
assert read('epubcheck.json')['checker']['nError'] == 0
assert read('epubcheck.json')['checker']['nWarning'] == 0

def content(element):
    nodes = [element.text] if element.text else []
    for child in element:
        nodes.append(child)
        if child.tail:
            nodes.append(child.tail)
    return nodes

def texts(element, path=()):
    found = {}
    for index, child in enumerate(content(element)):
        if isinstance(child, str):
            found[path + (index,)] = child
        else:
            found.update(texts(child, path + (index,)))
    return found

def near(actual, expected):
    for key in ['x', 'y', 'width', 'height']:
        assert abs(actual[key] - expected[key]) < 1e-6, (key, actual, expected)

selected = restored = 0
with ZipFile(sample) as archive:
    for chapter in result['chapters']:
        body = ET.fromstring(archive.read('EPUB/' + chapter['chapter'] + '.xhtml')).find('{http://www.w3.org/1999/xhtml}body')
        source = texts(body)
        assert len(chapter['initial']) == 5
        assert chapter['mainTargetLeftFirstPage']
        assert '盒内文字' not in chapter['headAt24']['text']
        for item in chapter['initial']:
            expected_path, = [path for path, value in source.items() if value == item['text']]
            mark = item['selected']
            assert mark['text'] == item['text']
            assert mark['start']['nodePath'] == mark['end']['nodePath'] == list(expected_path)
            assert mark['start']['textOffset'] == 0
            assert mark['end']['textOffset'] == len(item['text'].encode('utf-16-le')) // 2
            assert mark['targetJson']
            selected += 1
        for phase in ['reflow', 'reopened', 'back']:
            assert len(chapter[phase]) == 5
            for item in chapter[phase]:
                answer = item['restored']
                assert answer['status'] == 'Resolved' and answer['text'] == item['text']
                assert item['frame']['matchedBy'] == 'SourceRange'
                if chapter['chapter'] != 'horizontal':
                    assert len(answer['rects']) == 1
                    near(answer['rects'][0], item['expected'])
                restored += 1
        for initial, reflow, reopened, back in zip(chapter['initial'], chapter['reflow'], chapter['reopened'], chapter['back'], strict=True):
            assert initial['expected'] != reflow['expected']
            if chapter['chapter'] != 'horizontal':
                near(reflow['expected'], reopened['expected'])
                near(initial['expected'], back['expected'])
assert (selected, restored) == (15, 45)

failure = read('interaction-failure.json')
assert failure['sampleSha256'] == result['sampleSha256']
assert failure['chapters'][0]['initial'][0]['selected']['status'] == 'Unavailable(InvalidCaret)'
images = read('images/dev-fixed-native.json')
paint_size = json.loads((root / 'reports/vertical-image-constraints/dev-fixed-native.json').read_text(encoding='utf-8'))
for before, after in zip(paint_size['results'], images['results'], strict=True):
    assert before['pageText'] == after['pageText'] and before['displaySha256'] == after['displaySha256']
    assert after['imageCount'] == 2
    assert all((image['dest']['width'], image['dest']['height']) == (48,32) for image in after['images'])
checks = (out / 'checks.log').read_text(encoding='utf-8')
groups = re.findall(r'test result: ok\. (\d+) passed; 0 failed; (\d+) ignored;', checks)
assert 'FAILED' not in checks
passed = sum(int(passed) for passed, _ in groups)
ignored = sum(int(ignored) for _, ignored in groups)
assert (passed,ignored) == (1032,8), (passed,ignored)
assert read('source-audit.json')['trackedFilesVerified'] == 1557
assert read('source-before-address-fix.json')['trackedFilesVerified'] == 1556
summary = {'selectedMarks':selected,'restoredRanges':restored,'chaptersWithPageChange':3,
    'workspaceTestsPassed':passed,'workspaceTestsIgnored':ignored,'smallBookPaintAndTextUnchanged':True,
    'androidUpdatedKernelAdopted':False,'nativeProcessReopenTested':True,'lunarPersistenceRestartTested':False}
(out / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps(summary))
