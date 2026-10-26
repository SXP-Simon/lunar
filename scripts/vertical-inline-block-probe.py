"""Deterministic CC0 inline-block text/image controls for horizontal and vertical EPUB."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_STORED, ZIP_DEFLATED
import struct, zlib, hashlib, json
root=Path(__file__).resolve().parents[1]
def chunk(kind,data):
 return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data)&0xffffffff)
w,h=48,32
pixels=b"".join(b"\0"+b"".join(bytes((220,40,30,255) if x<w//2 and y<h//2 else (30,180,60,255) if y<h//2 else (40,70,210,255) if x<w//2 else (235,185,20,255))for x in range(w))for y in range(h))
png=b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",w,h,8,6,0,0,0))+chunk(b"IDAT",zlib.compress(pixels,9))+chunk(b"IEND",b"")
files={
 "mimetype":b"application/epub+zip",
 "META-INF/container.xml":b'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
 "EPUB/probe.png":png,
}
manifest='<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="png" href="probe.png" media-type="image/png"/>'
spine=nav=""
for identity,prop,mode in [("horizontal","writing-mode","horizontal-tb"),("vertical","writing-mode","vertical-rl"),("prefixed","-epub-writing-mode","vertical-rl")]:
 manifest+=f'<item id="{identity}" href="{identity}.xhtml" media-type="application/xhtml+xml"/>'
 spine+=f'<itemref idref="{identity}"/>'
 nav+=f'<li><a href="{identity}.xhtml">{identity}</a></li>'
 files[f"EPUB/{identity}.xhtml"]=(f'<html xmlns="http://www.w3.org/1999/xhtml" lang="zh" xml:lang="zh"><head><title>{identity}</title><style>html {{{prop}:{mode};}} body {{margin:0;}} p {{margin:0 0 1em;line-height:1.5;}} .box {{display:inline-block;}} img {{width:48px;height:32px;}}</style></head><body><p>外前<span class="box">盒内文字</span>外后</p><p>图前<span class="box"><img src="probe.png" alt="四色方块" /></span>图后</p><p>对照<img src="probe.png" alt="直接图片" />结束</p><p>嵌前<span class="box">一级<span class="box">二级</span>末尾</span>嵌后</p></body></html>').encode()
files["EPUB/package.opf"]=(f'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:lunar:cc0:vertical-inline-block:1</dc:identifier><dc:title>Lunar Vertical Inline Block Probe</dc:title><dc:language>zh</dc:language><dc:creator>Lunar compatibility tests</dc:creator><dc:rights>Original CC0 1.0 Universal test text and procedural PNG.</dc:rights><meta property="dcterms:modified">2026-10-26T00:00:00Z</meta></metadata><manifest>{manifest}</manifest><spine>{spine}</spine></package>').encode()
files["EPUB/nav.xhtml"]=(f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>{nav}</ol></nav></body></html>').encode()
path=root/"samples/vertical-inline-block-probe.epub"
with ZipFile(path,"w")as archive:
 for name,data in files.items():
  info=ZipInfo(name,(2026,10,26,0,0,0));info.compress_type=ZIP_STORED if name=="mimetype"else ZIP_DEFLATED
  archive.writestr(info,data)
print(json.dumps({"path":str(path),"bytes":path.stat().st_size,"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"pngSha256":hashlib.sha256(png).hexdigest()}))
