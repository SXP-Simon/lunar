"""Create a small CC0 EPUB 3 fixed-layout diagnostic, with no external assets."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED, ZIP_STORED

root = Path(__file__).resolve().parents[1]
entries = {
    'mimetype': 'application/epub+zip',
    'META-INF/container.xml': '''<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
<rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>''',
    'EPUB/package.opf': '''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">urn:uuid:7392496d-836e-4a87-8df5-d7817658d9b8</dc:identifier>
<dc:title>Lunar Fixed Layout Probe</dc:title><dc:language>en</dc:language>
<dc:creator>Lunar compatibility investigation</dc:creator>
<dc:rights>CC0 1.0 Universal</dc:rights><dc:source>https://creativecommons.org/publicdomain/zero/1.0/</dc:source>
<meta property="dcterms:modified">2026-10-25T00:00:00Z</meta>
<meta property="rendition:layout">pre-paginated</meta><meta property="rendition:spread">none</meta>
</metadata><manifest><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>
<item id="page" href="page.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="page"/></spine></package>''',
    'EPUB/nav.xhtml': '''<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol><li><a href="page.xhtml">Four corners</a></li></ol></nav></body></html>''',
    'EPUB/page.xhtml': '''<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><title>Four corners</title><meta name="viewport" content="width=600,height=800"/>
<style>html,body { margin:0; padding:0; width:600px; height:800px; background:white; color:black; }
p { position:absolute; margin:0; font-size:24px; line-height:1.2; }
#nw { top:20px; left:20px; } #ne { top:20px; left:440px; }
#sw { top:730px; left:20px; } #se { top:730px; left:440px; }
#center { top:380px; left:180px; }</style></head><body>
<p id="nw">TOP LEFT</p><p id="ne">TOP RIGHT</p>
<p id="center">ONE FIXED PAGE</p>
<p id="sw">BOTTOM LEFT</p><p id="se">BOTTOM RIGHT</p>
</body></html>''',
}
with ZipFile(root / 'samples/fixed-layout-probe.epub', 'w') as archive:
    for name, value in entries.items():
        info = ZipInfo(name, date_time=(2026, 10, 25, 0, 0, 0))
        info.compress_type = ZIP_STORED if name == 'mimetype' else ZIP_DEFLATED
        archive.writestr(info, value.encode('utf-8'))
