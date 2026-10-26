"""Check image/text preservation against the recorded production API evidence."""
from pathlib import Path
import hashlib
import json
import re

evidence = Path(__file__).resolve().parents[1]
root = evidence / "reports/kusamakura-image-pagination"


def read(name):
    return json.loads((root / name).read_text(encoding="utf-8-sig"))


def task(name):
    value = read(name)["result"]["value"]
    assert value["status"] == "done", value
    return value["value"]


sample = evidence / "samples/vertical-inline-block-probe.epub"
sample_sha = hashlib.sha256(sample.read_bytes()).hexdigest()
assert read("probe-source.json")["sha256"] == sample_sha
assert task("probe-install.json")["bookId"] == sample_sha
device = task("probe-device.json")
summary = []
for result, expected in zip(device["results"], (2, 1, 1)):
    painted = "".join(c.get("text", "") for f in result["frames"] for c in f["commands"] if c["kind"] == "text")
    indexed = "".join(f["pageText"] for f in result["frames"])
    images = sum(c["kind"] == "draw-image" for f in result["frames"] for c in f["commands"])
    assert "盒内文字" in indexed
    assert ("盒内文字" in painted) == (expected == 2)
    assert images == expected
    summary.append({"chapter": result["href"], "indexedInnerText": True, "paintedInnerText": expected == 2, "images": images})
assert any(r["locator"]["manifestHref"] == "vertical.xhtml" for r in task("invisible-text-search.json")["results"])

base, fixed = read("dev-base-native.json"), read("dev-fixed-native.json")
assert base["sampleSha256"] == fixed["sampleSha256"] == sample_sha
assert base["decoderSha256"] == fixed["decoderSha256"]
assert base["results"][0]["displaySha256"] == fixed["results"][0]["displaySha256"]
for before, after in zip(base["results"], fixed["results"]):
    assert before["pageText"] == after["pageText"]
    assert after["imageCount"] == 2
    for text in ("盒内文字", "一级", "二级", "末尾"):
        assert text in after["paintedText"]
    for command in after["images"]:
        rect = command["dest"]
        assert rect["width"] > 0 and rect["height"] > 0
        assert 0 <= rect["x"] and rect["x"] + rect["width"] <= 411
        assert 0 <= rect["y"] and rect["y"] + rect["height"] <= 914

kusa_base, kusa_fixed = read("dev-base-kusamakura-native.json"), read("dev-fixed-kusamakura-native.json")
assert kusa_base["sampleSha256"] == kusa_fixed["sampleSha256"]
assert kusa_base["results"][0]["imageCount"] == 0
assert kusa_fixed["results"][0]["imageCount"] == 1
assert kusa_fixed["results"][0]["images"][0]["src"].endswith("書デジ.png")
cover = task("pages.json")
assert cover["coverEnded"]
assert [f["localPageIndexes"] for f in cover["frames"]] == [[0], [1], [2], [3]]
assert any(i["source"].endswith("夏目漱石.jpg") for f in cover["frames"] for i in f["images"])
assert not any(i["source"].endswith("書デジ.png") for f in cover["frames"] for i in f["images"])

log = (root / "checks.log").read_text(encoding="utf-8")
groups = re.findall(r"test result: ok\. (\d+) passed; 0 failed; (\d+) ignored", log)
assert (sum(int(a) for a, _ in groups), sum(int(b) for _, b in groups), len(groups)) == (1020, 8, 39)
assert "test result: FAILED. 0 passed; 4 failed;" in (root / "baseline-regressions.log").read_text(encoding="utf-8")

# Preserve the separately discovered sizing failure; do not count it as fixed.
browser = read("landscape-browser-reference.json")
assert (browser["boxed"]["width"], browser["boxed"]["height"]) == (30, 20)
assert (browser["direct"]["width"], browser["direct"]["height"]) == (30, 20)
vertical_images = fixed["results"][1]["images"]
assert vertical_images[0]["dest"]["width"] == 32
assert vertical_images[1]["dest"]["width"] == 48
(root / "summary.json").write_text(json.dumps({"sampleSha256": sample_sha, "deviceBaseline": summary,
    "hostFixedInnerTextPreserved": True, "hostFixedImagesPerChapter": 2,
    "horizontalPaintUnchanged": True, "landscapeSizingStillUnfixed": True,
    "androidFixedKernelAdopted": False}, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
print("Verified the paint omission, restoration, unchanged layout/text, and the separate sizing limitation.")
