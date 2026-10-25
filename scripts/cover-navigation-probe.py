"""Original CC0 EPUBs isolating recoverable stale cover navigation."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED, ZIP_STORED

root = Path(__file__).resolve().parents[1]
for broken in (False, True):
    variant = 'broken' if broken else 'valid'
    target = root / f'samples/{variant}-cover-navigation.epub'
    cover_link = 'c0.xhtml' if broken else '../titlepage.xhtml'
    legacy_item = '<item id="legacy" href="OEBPS/c0.xhtml" media-type="application/xhtml+xml"/>' if broken else ''
    files = {
        'mimetype': 'application/epub+zip',
        'META-INF/container.xml': '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
        'package.opf': f'''<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:lunar:cc0:cover-navigation:{variant}:1</dc:identifier><dc:title>Lunar Cover Navigation {variant.title()}</dc:title><dc:language>en</dc:language><dc:creator>Lunar compatibility tests</dc:creator><dc:rights>Original CC0 1.0 Universal test content.</dc:rights><meta property="dcterms:modified">2026-10-25T16:00:00Z</meta></metadata><manifest><item id="cover" href="titlepage.xhtml" media-type="application/xhtml+xml"/><item id="chapter" href="OEBPS/chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="OEBPS/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>{legacy_item}</manifest><spine><itemref idref="cover"/><itemref idref="chapter"/></spine></package>''',
        'titlepage.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en"><head><title>Actual cover</title><meta name="calibre:cover" content="true"/></head><body><h1>VALID COVER</h1><p>This is the declared cover in the reading order.</p><p>Original CC0 test content.</p></body></html>',
        'OEBPS/chapter.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en"><head><title>Chapter One</title></head><body><h1>CHAPTER ONE</h1><p>The ordinary chapter remains reachable.</p></body></html>',
        'OEBPS/nav.xhtml': f'''<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en"><head><title>Navigation</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol><li><a href="{cover_link}">Cover</a></li><li><a href="chapter.xhtml">Chapter One</a></li></ol></nav><nav epub:type="landmarks"><h2>Landmarks</h2><ol><li><a epub:type="cover" href="{cover_link}">Cover</a></li><li><a epub:type="bodymatter" href="{cover_link}">Beginning</a></li></ol></nav></body></html>''',
    }
    if broken:
        files['OEBPS/c0.xhtml'] = '<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en"><head><title>Obsolete cover</title><link rel="stylesheet" type="text/css" href="missing.css"/></head><body><img src="missing-cover.png" alt="Obsolete cover"/></body></html>'
    with ZipFile(target, 'w') as archive:
        for name, text in files.items():
            info = ZipInfo(name, (2026, 10, 26, 0, 0, 0))
            info.compress_type = ZIP_STORED if name == 'mimetype' else ZIP_DEFLATED
            archive.writestr(info, text.encode('utf-8'))
    print(target.name)
