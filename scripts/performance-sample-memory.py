import subprocess,time,json,re,argparse
from pathlib import Path
parser=argparse.ArgumentParser(description='Sample the running Lunar test process RSS without changing app code.')
parser.add_argument('--out',type=Path,default=Path('.tmp/epub-validation/perf-device'))
parser.add_argument('--serial',default='emulator-5554')
parser.add_argument('--package',default='com.lunarain_079.lunar.dev')
parser.add_argument('--seconds',type=float,default=600)
args=parser.parse_args()
if args.seconds<=0:parser.error('--seconds must be positive')
root=args.out;root.mkdir(parents=True,exist_ok=True)
if (root/'memory-stop').exists():parser.error('Choose a fresh --out directory; memory-stop already exists')
pkg=args.package
pid=subprocess.check_output(['adb','-s',args.serial,'shell','pidof',pkg],text=True).strip()
assert pid.isdecimal()
start=time.monotonic();end=start+args.seconds
with (root/'memory-samples.jsonl').open('w',encoding='utf8') as f:
 while time.monotonic()<end and not (root/'memory-stop').exists():
  before=time.time_ns()/1e6
  raw=subprocess.check_output(['adb','-s',args.serial,'shell','cat',f'/proc/{pid}/status','/proc/meminfo'],text=True,timeout=15)
  row={'hostAtMs':before,'elapsedMs':1000*(time.monotonic()-start),'pid':int(pid)}
  for k in ['VmRSS','VmHWM','RssAnon','RssFile','MemAvailable','MemTotal']:
   m=re.search(r'^'+k+r':\s+(\d+) kB',raw,re.M)
   if m:row[k+'KiB']=int(m.group(1))
  f.write(json.dumps(row)+'\n');f.flush();time.sleep(1)
print('memory sampler finished')
