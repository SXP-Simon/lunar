"""Compare original source chapters and independently rebuilt rowspan probes."""
from collections import defaultdict
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]/'reports/rowspan-investigation'
base=json.loads((root/'baseline-final.json').read_text(encoding='utf-8'))
fixed=json.loads((root/'fixed-final.json').read_text(encoding='utf-8'))
assert base['sourceCommit']=='ed0284f3703244da28b3e6efd80cf29267cf6e65'
assert len(base['results'])==len(fixed['results'])==4
def source_text(chapter):
    text=defaultdict(str)
    for line in chapter['lines']:
        text[line['source']]+=''.join(c for c in line['text'] if not c.isspace())
    return dict(text)
def outside(chapter,height):
    return [line for line in chapter['lines'] if line['y'] < -1e-6 or line['y']+line['height'] > height+1e-6]
summaries=[]
for old,new in zip(base['results'],fixed['results'],strict=True):
    assert old['exitCode']==new['exitCode']==0,(old,new)
    assert old['sampleSha256']==new['sampleSha256']
    height=new['request'].get('fragmentainerSize')
    chapters=[]
    for before,after in zip(old['output']['chapters'],new['output']['chapters'],strict=True):
        assert before['idref']==after['idref']
        assert source_text(before)==source_text(after),'source text changed'
        item={'idref':after['idref'],'sameTextPerSourceNode':True,
              'textLines':len(after['lines']),'pages':max(line['page'] for line in after['lines'])+1}
        if after['idref']=='id0005':
            assert before==after,'ordinary non-spanning table changed'
            item['identicalOrdinaryTable']=True
        elif after['idref']=='id0001':
            ms=lambda chapter:next(line for line in chapter['lines'] if line['text']=='MS明朝')
            a,b=ms(before),ms(after)
            assert b['x']>a['x']+100,'second-row header stayed in the first column'
            item['secondRowHeader']={'before':a,'after':b}
        else:
            expected=60 if height==80 else 31
            assert len(after['lines'])==expected
            for row in range(30):
                assert sum(line['text']==f'Row {row:02}' for line in after['lines'])==1
                if height==80:assert sum(line['text']==f'Span {row:02}' for line in after['lines'])==1
            if height==50:assert item['pages']==15
        if height is not None:
            assert not outside(after,height),'text outside a page'
            item['outsideLinesBefore']=len(outside(before,height))
            item['outsideLinesAfter']=0
        chapters.append(item)
    summaries.append({'sampleSha256':new['sampleSha256'],'fragmentainerSize':height,'chapters':chapters})
(root/'comparison.json').write_text(json.dumps(summaries,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('PASS: original text preserved; header column repaired; ordinary table unchanged; both long fixtures readable.')
