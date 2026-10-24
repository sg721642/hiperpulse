import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from app.signal import sample
target=Path(__file__).resolve().parent.parent/'samples'
target.mkdir(exist_ok=True)
for name in ('clean','artifact','flat'):
    (target/f'{name}.json').write_text(json.dumps(sample(name)),encoding='utf-8')
print('Wrote three synthetic samples. Clean input is generated at 72 BPM; no human data is included.')
