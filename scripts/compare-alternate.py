"""Compare recorded native probe results; fail if the claimed control fails."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
baseline = json.loads((root / 'reports/alternate-baseline-native.json').read_text('utf-8'))
fixed = json.loads((root / 'reports/alternate-fixed-native.json').read_text('utf-8'))

def error_text(result):
    return result.get('stderr', '') + '\n'.join(
        c.get('error', '') for c in result.get('output', {}).get('chapters', [])
    )

def success(result):
    chapters = result.get('output', {}).get('chapters', [])
    return result['exitCode'] == 0 and bool(chapters) and all(not c.get('error') and c['lines'] for c in chapters)

before = {r['file']: r for r in baseline['results']}
after = {r['file']: r for r in fixed['results']}
original = 'wasteland-otf.epub'
control = 'wasteland-otf-day-only.epub'
japanese = 'kusamakura-japanese-vertical-writing.epub'
checks = {
    'differentProbeBinaries': baseline['probeSha256'] != fixed['probeSha256'],
    'sameSampleHashes': all(before[n]['sha256'] == after[n]['sha256'] for n in before),
    'baselineOriginalRejectedBySelection': 'SelectionIssue' in error_text(before[original]),
    'baselineJapaneseRejectedBySelection': 'SelectionIssue' in error_text(before[japanese]),
    'baselineControlSucceeds': success(before[control]),
    'fixedAllThreeSucceed': all(success(r) for r in fixed['results']),
    'fixedOriginalEqualsControl': after[original]['output'] == after[control]['output'],
    'controlUnchangedAcrossFix': before[control]['output'] == after[control]['output'],
}
summary = {
    'baselineCommit': baseline['sourceCommit'],
    'fixedCommit': fixed['sourceCommit'],
    'checks': checks,
    'samples': [{
        'file': name,
        'sha256': result['sha256'],
        'chapters': [{
            'idref': c['idref'], 'error': c.get('error'), 'textRecords': len(c['lines']),
            'pages': max((line['page'] for line in c['lines']), default=-1) + 1,
        } for c in result.get('output', {}).get('chapters', [])],
    } for name, result in after.items()],
}
(root / 'reports/alternate-native-comparison.json').write_text(
    json.dumps(summary, indent=2, ensure_ascii=False) + '\n', encoding='utf-8'
)
print(json.dumps(summary, indent=2, ensure_ascii=False))
assert all(checks.values()), 'Native probe evidence does not support every claim'
