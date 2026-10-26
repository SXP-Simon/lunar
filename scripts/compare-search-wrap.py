"""Compare separately rebuilt production ReaderSession search probes."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'reports' / 'search-wrap-fix'
before = json.loads((root / 'base.json').read_text(encoding='utf-8'))
after = json.loads((root / 'fixed.json').read_text(encoding='utf-8'))
assert before['epubSha256'] == after['epubSha256'] == '3217b1cb335c9b10d84e7816b88d70a05ab767b28411f287b9fbca78884faabb'
assert before['pages'] == after['pages'], 'page text and UTF-16 lengths changed'
assert len(after['pages']) == 1, 'this is a same-page regression'
assert before['displayListSha256'] == after['displayListSha256'], 'paint instructions changed'
for index, expected in enumerate([1, 1, 1, 1, 0, 0]):
    old, new = before['tests'][index], after['tests'][index]
    assert old['query'] == new['query']
    assert old['searchedPageCount'] == new['searchedPageCount'] == 1
    assert len(old['results']) == (0 if index < 2 else expected)
    assert len(new['results']) == expected, new
    if not expected:
        continue
    hit = new['results'][0]
    assert hit['source']['status'] == 'Resolved', hit
    assert hit['source']['selectedText'] == new['query'], hit
    assert hit['rectCount'] > 0 and hit['source']['rectCount'] > 0
    if index < 2:
        assert hit['start']['lineIndex'] != hit['end']['lineIndex']
        assert hit['source']['start'] == {'nodePath': [index + 1, 0], 'textOffset': 0}
        assert hit['source']['end'] == {'nodePath': [index + 1, 0], 'textOffset': len(new['query'])}
        assert hit['rectCount'] >= 2

summary = {
    'epubSha256': after['epubSha256'],
    'samePageText': True,
    'sameDisplayList': True,
    'displayListSha256': after['displayListSha256'],
    'beforeCounts': [len(t['results']) for t in before['tests']],
    'afterCounts': [len(t['results']) for t in after['tests']],
    'fullSourceAndMultilineGeometry': True,
    'hardBreakAndParagraphNegativeControls': True,
}
(root / 'comparison.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
