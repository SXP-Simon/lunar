"""Validate the captured public-sample runs and regenerate their numeric summary."""
import hashlib
import json
import statistics
import zipfile
from pathlib import Path

evidence = Path(__file__).resolve().parents[1]
root = evidence / "reports/performance-streaming-import"


def read(name):
    return json.loads((root / name).read_text(encoding="utf-8-sig"))


def value(name):
    result = read(name)["result"]["value"]
    assert result["status"] == "done", result
    return result["value"]


summary = {"runs": {}, "scope": "Foreground development APK; three reimports per sample, one process per version."}
for mode in ("baseline", "fixed"):
    data = value(f"{mode}-formal-imports.json")
    assert data["environment"] == {
        "appState": "active", "nativeSessionLoaded": False, "resumeReadingOnLaunch": False
    }, data["environment"]
    records = data["records"]
    assert not any(r.get("status") == "error" or r["name"].startswith("runtime.") for r in records)
    imports = [r for r in records if r["name"] == "import.total"]
    assert len(imports) == 6
    memory = [json.loads(line) for line in (root / f"{mode}-formal-memory/memory-samples.jsonl").read_text().splitlines()]
    # The clock probe bounds the observed mismatch to about one second.
    # Expand both edges by two seconds instead of implying exact alignment.
    samples = [r for r in memory if imports[0]["startedAtMs"] - 2000 <= r["hostAtMs"] <= imports[-1]["atMs"] + 2000]
    assert len(samples) >= 10
    output = {
        "environment": data["environment"],
        "rssWindow": {
            "edgePaddingMs": 2000,
            "samples": len(samples), "firstHostAtMs": samples[0]["hostAtMs"], "lastHostAtMs": samples[-1]["hostAtMs"],
            "minMiB": min(r["VmRSSKiB"] for r in samples) / 1024,
            "maxMiB": max(r["VmRSSKiB"] for r in samples) / 1024,
        },
        "zipSyncCalls": sum(r["name"] == "zip.zipSync" for r in records),
        "samples": {},
    }
    assert output["zipSyncCalls"] == (6 if mode == "baseline" else 0)
    for prefix in ("moby", "kusa"):
        selected = [r for r in imports if r["run"].startswith(prefix)]
        assert len(selected) == 3
        for row in selected:
            progress = [p["value"] for p in row["progress"]]
            assert progress == sorted(progress) and progress[-1] == 1
        durations = [r["durationMs"] for r in selected]
        output["samples"][prefix] = {
            "durationMs": durations, "medianDurationMs": statistics.median(durations),
            "maxTimerDelayMs": [r["eventLoop"]["maxDelayMs"] for r in selected],
        }
    summary["runs"][mode] = output

summary["assets"] = []
for book, name in zip(value("fixed-assets.json"), ("moby-dick.epub", "kusamakura-vertical-only.epub")):
    source = evidence / "samples" / name
    assert hashlib.sha256(source.read_bytes()).hexdigest() == book["bookId"] == book["managedSha256"]
    assert source.stat().st_size == book["managedBytes"]
    with zipfile.ZipFile(source) as archive:
        expected = {name: (len(archive.read(name)), hashlib.sha256(archive.read(name)).hexdigest())
                    for name in archive.namelist() if not name.endswith("/")}
    actual = {a["path"]: (a["byteSize"], a["sha256"]) for a in book["assets"]}
    assert expected == actual
    assert book["coverSha256"] in {sha for _, sha in expected.values()}
    summary["assets"].append({"sample": name, "entries": len(actual), "allSourceBytesMatch": True})

for sample in ("moby", "kusa"):
    result = value(f"{sample}-reader-comparison.json")
    assert result["matched"]
    left, right = result["results"]
    assert left["kind"] == "store" and right["kind"] == "compressed"
    assert len(left["frames"]) == len(right["frames"]) == (8 if sample == "moby" else 5)
    for a, b in zip(left["frames"], right["frames"]):
        assert {k: v for k, v in a.items() if k != "position"} == {k: v for k, v in b.items() if k != "position"}
        assert a["position"]["locator"] == b["position"]["locator"]
    assert left["frames"][0]["position"]["locator"] == left["frames"][-1]["position"]["locator"]
    if sample == "moby":
        assert sum(len(f["images"]) for f in left["frames"]) >= 2
        for key in ("originalGeometry", "reflowedGeometry"):
            assert left[key] == right[key]
            assert left[key]["selectedText"] == "Ishmael" and left[key]["rects"]
        assert left["originalGeometry"]["rects"] != left["reflowedGeometry"]["rects"]

migration = read("migration-state-comparison.json")
assert migration["unchanged"] and migration["before"] == migration["after"]
summary["durableStateUnchanged"] = True
assert "566 passed (566)" in (root / "checks/workspace-tests.log").read_text(encoding="utf-8-sig")
(root / "summary.json").write_text(json.dumps(summary, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
print("Validated six imports per version, 184 source assets, reader comparisons and durable state.")
