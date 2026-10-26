"""Original CC0 fixture: a row-spanning group longer than one page."""
from pathlib import Path
from zipfile import ZipFile,ZipInfo,ZIP_STORED,ZIP_DEFLATED
import sys
root=Path(__file__).resolve().parents[1]
rows=''.join('<tr>'+('<th rowspan="30">Group</th>' if i==0 else '')+f'<td>Row {i:02d}</td></tr>' for i in range(30))
files={
 'mimetype':'application/epub+zip',
 'META-INF/container.xml':'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
 'EPUB/package.opf':'''<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:lunar:cc0:rowspan-pagination:1</dc:identifier><dc:title>Lunar Rowspan Pagination Probe</dc:title><dc:language>en</dc:language><dc:creator>Lunar compatibility tests</dc:creator><dc:rights>Original CC0 1.0 Universal test content.</dc:rights><meta property="dcterms:modified">2026-10-26T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="text" href="text.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="text"/></spine></package>''',
 'EPUB/nav.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="text.xhtml">Rowspan pagination</a></li></ol></nav></body></html>',
 'EPUB/text.xhtml':f'<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en"><head><title>Rowspan pagination</title><style>body {{margin:0;}} table {{border-spacing:0;}} td,th {{padding:2px;border:1px solid black;vertical-align:top;}}</style></head><body><table><tbody>{rows}</tbody></table></body></html>',
}
parallel='--parallel' in sys.argv[1:]
target=root/('samples/rowspan-parallel-probe.epub' if parallel else 'samples/rowspan-pagination-probe.epub')
if parallel:
 span=''.join(f'<p>Span {i:02d}</p>' for i in range(30))
 files['EPUB/text.xhtml']=files['EPUB/text.xhtml'].replace('<th rowspan="30">Group</th>',f'<td rowspan="30">{span}</td>')
 files['EPUB/text.xhtml']=files['EPUB/text.xhtml'].replace('body {margin:0;}','body,p {margin:0;} body {font-size:20px;}')
 files['EPUB/package.opf']=files['EPUB/package.opf'].replace('rowspan-pagination:1','rowspan-parallel:1').replace('Lunar Rowspan Pagination Probe','Lunar Parallel Rowspan Probe')
with ZipFile(target,'w') as z:
 for name,text in files.items():
  info=ZipInfo(name,(2026,10,26,0,0,0));info.compress_type=ZIP_STORED if name=='mimetype' else ZIP_DEFLATED
  z.writestr(info,text.encode('utf-8'))
print(target)
