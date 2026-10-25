"""Check Cole's single standalone image against actual text rectangles."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'reports'
def read(name):
    return json.loads((root / name).read_text('utf-8'))

def intersects(a, b):
    return (min(a['x'] + a['width'], b['x'] + b['width']) - max(a['x'], b['x']) > .5
            and min(a['y'] + a['height'], b['y'] + b['height']) - max(a['y'], b['y']) > .5)

def inspect(result):
    assert result['exitCode'] == 0
    chapter = result['output']['chapters'][0]
    assert not chapter.get('error')
    lines = chapter['lines']
    # This source chapter has one standalone image and no empty decorations.
    images = [l for l in lines if not l['text'] and l['height'] > 30 and l['width'] > 30]
    assert len(images) == 1
    text = [l for l in lines if l['text']]
    collisions = [l for l in text if l['page'] == images[0]['page'] and intersects(l, images[0])]
    return {'fragmentainer': result['request'].get('fragmentainerSize'),
            'image': images[0], 'overlappingTextLines': collisions,
            'text': ' '.join(''.join(l['text'] for l in text).split())}

before = read('float-upstream-native.json')
after = read('float-fixed-native.json')
baseline = [inspect(r) for r in before['results']]
fixed = [inspect(r) for r in after['results']]
device = read('float-device-primitives.json')
ratio = device[0]['ratio']
commands = [r['command'] for r in device[1:]]
assert not any(c['kind'] == 'transform' or (c['kind'] == 'translate' and (c['dx'] or c['dy'])) for c in commands)
image = next(c['dest'] for c in commands if c['kind'] == 'draw-image')
image = {k: v / ratio for k, v in image.items()}
device_collisions = [{'text': c['text'], 'rect': c['rect']} for c in commands
                     if c['kind'] == 'text' and intersects(c['rect'], image)]
checks = {
    'differentProbeBinaries': before['probeSha256'] != after['probeSha256'],
    'sameSample': before['sampleSha256'] == after['sampleSha256'],
    'deviceAlreadyOverlapsBeforeSkia': bool(device_collisions),
    'baselineContinuousAndPaginatedOverlap': all(r['overlappingTextLines'] for r in baseline),
    'fixedContinuousAndPaginatedDoNotOverlap': all(not r['overlappingTextLines'] for r in fixed),
    'allTextPreserved': all(a['text'] == b['text'] for a, b in zip(baseline, fixed, strict=True)),
}
report = {'checks': checks, 'baselineCommit': before['sourceCommit'], 'fixedCommit': after['sourceCommit'],
          'device': {'imageCssRect': image, 'overlappingRuns': device_collisions},
          'baseline': baseline, 'fixed': fixed}
(root / 'float-native-comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(checks, indent=2))
assert all(checks.values())
