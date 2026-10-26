from pathlib import Path
import base64
import zipfile

evidence = Path(__file__).resolve().parents[1]
out = evidence / 'reports/vertical-image-constraints'
out.mkdir(exist_ok=True)
with zipfile.ZipFile(evidence / 'samples/vertical-inline-block-probe.epub') as book:
    name = next(n for n in book.namelist() if n.endswith('.png'))
    data = base64.b64encode(book.read(name)).decode()
html = '''<!doctype html><meta charset="utf-8"><style>
body{margin:0}.page{writing-mode:vertical-rl;overflow:visible}.box{display:inline-block}
.fixed{width:30px;height:20px;max-width:100%;object-fit:fill}.percent{width:50%;height:auto}
</style>'''
for width, height in [(100, 200), (80, 120)]:
    html += f'<div class="page" style="width:{width}px;height:{height}px" data-width="{width}" data-height="{height}">'
    html += f'<span class="box"><img class="fixed boxed" src="data:image/png;base64,{data}"></span>'
    html += f'<img class="fixed direct" src="data:image/png;base64,{data}">'
    html += f'<img class="percent" src="data:image/png;base64,{data}"></div>'
html += '''<script>window.onload=()=>{const result={userAgent:navigator.userAgent,pages:[...document.querySelectorAll('.page')].map(page=>({width:+page.dataset.width,height:+page.dataset.height,images:[...page.querySelectorAll('img')].map(img=>({kind:img.className,rect:img.getBoundingClientRect().toJSON()}))}))};const pre=document.createElement('pre');pre.id='result';pre.textContent=JSON.stringify(result);document.body.append(pre)};</script>'''
(out / 'browser-control.html').write_text(html, encoding='utf-8')
