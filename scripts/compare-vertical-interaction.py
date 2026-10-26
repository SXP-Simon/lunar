"""Assertions over separately rebuilt public ReaderSession probes."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'reports/vertical-interaction-fix'
base = json.loads((root/'base.json').read_text(encoding='utf-8'))
fixed = json.loads((root/'fixed.json').read_text(encoding='utf-8'))
assert base['sampleSha256'] == fixed['sampleSha256'] == '3504352a4242bec633742ae496411394ab54ffdfe0df830efb22121f8d3aa3e8'
assert base['decoderSha256'] == fixed['decoderSha256']
summary = []
for before, after in zip(base['cases'], fixed['cases'], strict=True):
    assert (before['chapter'],before['size']) == (after['chapter'],after['size'])
    assert before['displaySha256'] == after['displaySha256'], 'paint must not change'
    assert before['text'] == after['text'], 'page text must not change'
    if after['chapter'] == 'horizontal':
        assert before['hits'] == after['hits'], 'horizontal hit geometry regressed'
        assert before['checks'] == after['checks'], 'horizontal selection/marks regressed'
    else:
        assert before['hits'] != after['hits'], 'vertical hit projection did not change'
    states = []
    for old, new in zip(before['checks'],after['checks'],strict=True):
        key = 'selected' if after['size'] == 18 else 'restored'
        result = new[key]
        assert result['text'] == new['text']
        if after['chapter'] != 'horizontal':
            assert old[key]['text'] != new['text'], 'baseline must reproduce wrong selection'
            assert len(result['rects']) == 1
            for k,v in new['expected'].items():
                assert abs(result['rects'][0][k]-v) < 1e-6
            assert any(h['text'].find(new['text']) >= 0 and
                abs(h['bounds']['x']-new['expected']['x']) < 1e-6 and
                h['bounds']['y'] <= new['expected']['y'] < h['bounds']['y']+h['bounds']['height']
                for h in after['hits']), 'native hit must cover the painted glyph'
        states.append({'text':new['text'],'baselineText':old[key]['text'],
            'fixedText':result['text'],'fixedRects':result['rects']})
    summary.append({'chapter':after['chapter'],'size':after['size'],
        'samePaint':True,'samePageText':True,'checks':states})
for a,b in zip(fixed['cases'][::2],fixed['cases'][1::2],strict=True):
    assert a['checks'][0]['expected'] != b['checks'][0]['expected'], 'font change must really reflow'
(root/'comparison.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('PASS: six frames have unchanged paint/text; controls unchanged; vertical pointer and reflow marks align.')
