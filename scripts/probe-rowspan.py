"""Probe original IDPF tables via the production chapter layout pipeline."""
import argparse
from pathlib import Path
import subprocess
import json
import hashlib

p=argparse.ArgumentParser()
p.add_argument('--probe',required=True)
p.add_argument('--source',required=True)
p.add_argument('--label',required=True)
p.add_argument('--commit',required=True)
a=p.parse_args()
root=Path(__file__).resolve().parents[1]
book=root/'samples/internallinks.epub'
source=Path(a.source)
results=[]
fixture=root/'samples/rowspan-pagination-probe.epub'
inputs=[(book,['id0001','id0005'],None),(book,['id0001','id0005'],592)]
if fixture.exists():inputs.append((fixture,['text'],50))
parallel=root/'samples/rowspan-parallel-probe.epub'
if parallel.exists():inputs.append((parallel,['text'],80))
for input_book,idrefs,height in inputs:
    request={'epubPath':str(input_book),'fontPaths':[
        str(source/'apps/reader/src/assets/fonts/Tinos-Regular.ttf'),
        str(source/'apps/reader/src/assets/fonts/SourceHanSerifCN-Regular.otf')],
        'contentWidthPx':363,'chapterIdrefs':idrefs}
    if height is not None:request['fragmentainerSize']=height
    run=subprocess.run([a.probe],input=json.dumps(request),capture_output=True,text=True,timeout=180)
    result={'request':request,'sampleSha256':hashlib.sha256(input_book.read_bytes()).hexdigest(),
        'exitCode':run.returncode,'stderr':run.stderr}
    if run.returncode==0:result['output']=json.loads(run.stdout)
    else:result['stdout']=run.stdout
    results.append(result)
report={'sourceCommit':a.commit,
    'sampleSha256':hashlib.sha256(book.read_bytes()).hexdigest(),
    'probeSha256':hashlib.sha256(Path(a.probe).read_bytes()).hexdigest(),'results':results}
out=root/'reports/rowspan-investigation';out.mkdir(exist_ok=True)
(out/(a.label+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(a.label,[r['exitCode'] for r in results],flush=True)
