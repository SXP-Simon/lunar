"""Validate saved close-order evidence; this does not rerun Android."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
report = root / 'reports/reader-close-pending'
read_json = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
manifest = read_json(report / 'manifest.json')
for relative, expected in manifest['copiedFileSha256'].items():
    assert hashlib.sha256((root / relative).read_bytes()).hexdigest() == expected, relative
assert hashlib.sha256((root / 'samples/moby-dick.epub').read_bytes()).hexdigest() == manifest['sampleSha256']
trials = read_json(report / 'formal-trials.json')
assert len(trials) == 6
assert [(t['round'], t['label']) for t in trials] == [(i, name) for i in (1, 2, 3) for name in ('baseline', 'fixed')]
for trial in trials:
    label, number = trial['label'], trial['round']
    raw = read_json(report / f'{label}-{number}.json')['result']['value']
    assert raw['status'] == 'done'
    assert trial == {'round': number, 'label': label, 'commit': trial['commit'], **raw['value']}
    fixed = label == 'fixed'
    assert trial['commit'] == manifest['fixedCommit' if fixed else 'baselineCommit']
    assert trial['disposeStatus'] == 'ok'
    assert trial['phaseWhenCloseResolved'] == 'idle'
    assert trial['tracksPendingClose'] is fixed
    assert trial['nativeDisposedWhenCloseResolved'] is fixed
    expected = ['runtime.close.start', 'native.dispose.start', 'native.dispose.end', 'runtime.close.resolved'] if fixed else ['runtime.close.start', 'runtime.close.resolved', 'native.dispose.start', 'native.dispose.end']
    assert [e['name'] for e in trial['events']] == expected
    assert all(a['atMs'] <= b['atMs'] for a, b in zip(trial['events'], trial['events'][1:]))
baseline = (report / 'checks/baseline-final-tests.log').read_text(encoding='utf-8-sig')
assert '2 failed | 24 passed (26)' in baseline and 'Unhandled Rejection' in baseline and 'native disposal failed' in baseline
assert '26 passed (26)' in (report / 'checks/fixed-targeted-tests.log').read_text(encoding='utf-8-sig')
full = (report / 'checks/fixed-mobile-tests.log').read_text(encoding='utf-8-sig')
assert '87 passed (87)' in full and '541 passed (541)' in full
previous = read_json(report / 'diagnostics/original-settings-and-invalid-setup.json')['result']['value']['value']['previousResumeReadingOnLaunch']
restored = read_json(report / 'settings-restored.json')['result']['value']
assert previous is True and restored == {'before': False, 'restored': True}
print(json.dumps({'formalTrialsVerified': 6, 'fixedPassed': 3, 'baselinePremature': 3, 'sourceFiles': len(manifest['changedSourceSha256']), 'sampleAndScriptHashes': 'ok', 'settingsRestored': True}))
