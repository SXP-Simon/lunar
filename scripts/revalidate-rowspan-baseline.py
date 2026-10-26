"""Inject only runtime regressions into dev; production code stays unchanged.

Linux usage: python3 revalidate-rowspan-baseline.py BASE_EXPORT FIXED_EXPORT TARGET OUTPUT
Run after saving the fixed probe. Workspace artifacts are cleaned before switching.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

base,fixed,target,out=map(lambda value:Path(value).resolve(),sys.argv[1:])
paths=[Path('crates/rito-core/src/runtime/tests.rs'),Path('crates/rito-core/src/runtime/tests/table_rowspan_tests.rs')]
original={p:(base/p).read_bytes() if (base/p).exists() else None for p in paths}
env=dict(os.environ,CARGO_TARGET_DIR=str(target),CARGO_BUILD_JOBS='2')
out.mkdir(parents=True,exist_ok=True)
try:
    for p in paths:(base/p).write_bytes((fixed/p).read_bytes())
    subprocess.run(['cargo','+1.95.0','clean','--workspace'],cwd=base,env=env,check=True)
    run=subprocess.run(['cargo','+1.95.0','test','--locked','-p','rito-core','table_rowspan','--lib'],cwd=base,env=env,
                       stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    (out/'baseline-runtime-tests.log').write_bytes(run.stdout)
    log=run.stdout.decode('utf-8')
    match=re.search(r'test result: FAILED\. (\d+) passed; (\d+) failed;',log)
    assert run.returncode==101 and match,log[-3000:]
    passed,failed=map(int,match.groups())
    assert passed+failed==6 and failed>=4
    for name in ['rowspan_header_keeps_the_second_row_under_the_fourth_column',
                 'rowspan_and_colspan_reserve_their_entire_rectangle','zero_rowspan_stops_at_its_row_group',
                 'rowspan_parallel_text_with_different_line_positions_remains_readable']:
        assert re.search(r'test runtime::tests::table_rowspan_tests::'+name+r' \.\.\. FAILED',log),name
    (out/'baseline-runtime-tests.json').write_text(json.dumps({
        'productionCodeChanged':False,'testInstrumentationRestored':True,
        'passed':passed,'failed':failed,'exitCode':run.returncode,
    },indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'passed':passed,'failed':failed}))
finally:
    for p,content in original.items():
        if content is None:(base/p).unlink(missing_ok=True)
        else:(base/p).write_bytes(content)
