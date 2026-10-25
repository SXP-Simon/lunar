"""Original CC0 Ruby and writing-mode controls; no external fonts or alternates."""
from pathlib import Path
from zipfile import ZipFile,ZipInfo,ZIP_STORED,ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
items=[('horizontal','Horizontal Ruby','horizontal-tb',False),('vertical','Vertical Ruby','vertical-rl',False),('prefixed','EPUB Prefix Ruby','vertical-rl',True)]
files={
'mimetype':'application/epub+zip',
'META-INF/container.xml':'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'}
manifest='<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
nav=''
spine=''
for id,title,mode,prefix in items:
 manifest+=f'<item id="{id}" href="{id}.xhtml" media-type="application/xhtml+xml"/>'
 spine+=f'<itemref idref="{id}"/>'
 nav+=f'<li><a href="{id}.xhtml">{title}</a></li>'
 prop='-epub-writing-mode' if prefix else 'writing-mode'
 files[f'EPUB/{id}.xhtml']=f'''<html xmlns="http://www.w3.org/1999/xhtml" lang="ja" xml:lang="ja"><head><title>{title}</title><style>html {{{prop}:{mode};}} body {{margin:0;}} p {{line-height:2; margin:0 0 1em;}} rt {{font-size:50%;}} h1 {{font-size:1.2em;}}</style></head><body><h1>{title}</h1><p id="ruby"><ruby>山道<rt>やまみち</rt></ruby>を歩く。<ruby>漢字<rt>かんじ</rt></ruby>を読む。</p><p id="lines">一列目の終わり。二列目の始まり。春の風が静かな庭を通る。文字の順番を確かめる。</p><p id="tail">最後の段落。終点。</p></body></html>'''
files['EPUB/package.opf']=f'''<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:lunar:cc0:ruby-writing-mode:1</dc:identifier><dc:title>Lunar Ruby Writing Mode Probe</dc:title><dc:language>ja</dc:language><dc:creator>Lunar compatibility tests</dc:creator><dc:rights>Original CC0 1.0 Universal test content.</dc:rights><meta property="dcterms:modified">2026-10-26T00:00:00Z</meta></metadata><manifest>{manifest}</manifest><spine>{spine}</spine></package>'''
files['EPUB/nav.xhtml']=f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>{nav}</ol></nav></body></html>'
with ZipFile(root/'samples/ruby-writing-mode-probe.epub','w') as z:
 for n,t in files.items():
  i=ZipInfo(n,(2026,10,26,0,0,0));i.compress_type=ZIP_STORED if n=='mimetype' else ZIP_DEFLATED;z.writestr(i,t.encode('utf8'))
