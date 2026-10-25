"""Generate an original CC0 fixture for search across visual line wrapping."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED, ZIP_STORED

root = Path(__file__).resolve().parents[1]
target = root / 'samples/search-wrap-probe.epub'
files = {
    'mimetype': 'application/epub+zip',
    'META-INF/container.xml': '''<?xml version="1.0" encoding="utf-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>''',
    'EPUB/package.opf': '''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:lunar:cc0:search-wrap-probe:1</dc:identifier><dc:title>Lunar Search Wrap Probe</dc:title><dc:language>zh-CN</dc:language><dc:creator>Lunar compatibility tests</dc:creator><dc:rights>Original test content dedicated to CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/</dc:rights><meta property="dcterms:modified">2026-10-25T16:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="text" href="text.xhtml" media-type="application/xhtml+xml"/><item id="css" href="style.css" media-type="text/css"/></manifest><spine><itemref idref="text"/></spine></package>''',
    'EPUB/nav.xhtml': '''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN" xml:lang="zh-CN"><head><title>目录</title></head><body><nav epub:type="toc"><h1>目录</h1><ol><li><a href="text.xhtml">自动换行与搜索</a></li></ol></nav></body></html>''',
    'EPUB/style.css': 'body { margin: 0; } h1 { font-size: 1.2em; } p { margin: 0 0 1em; text-indent: 0; }',
    'EPUB/text.xhtml': '''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN" xml:lang="zh-CN"><head><title>自动换行与搜索</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body><h1>自动换行与搜索</h1><p id="cjk">清晨的微风掠过窗台，书页上的文字随着视线缓缓向前延伸，读者应当能够搜索跨越自动换行的完整句子。</p><p id="english" lang="en">A reader should find this complete sentence even when narrow pages wrap it onto several visual lines.</p><p id="hard-break">硬换行前的句子<br/>硬换行后的句子</p><p id="paragraph-a">段落分隔控制甲</p><p id="paragraph-b">段落分隔控制乙</p></body></html>''',
}
with ZipFile(target, 'w') as archive:
    for name, text in files.items():
        info = ZipInfo(name, (2026, 10, 26, 0, 0, 0))
        info.compress_type = ZIP_STORED if name == 'mimetype' else ZIP_DEFLATED
        archive.writestr(info, text.encode('utf-8'))
print(target)
