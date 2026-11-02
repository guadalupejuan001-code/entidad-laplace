"""Execute the authentic XI runtime; no JS substitute or future training labels.

python3 apps/laplace-android/tests/xn02-native.py [--study]
Requires build/native-xi-runner built against the pinned Ether overlay.
"""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / 'apps/laplace-android/app/src/main/assets'
DATA = ROOT / 'evidencia/entrenamiento-x002-20261030/velas.json'
RUNNER = ROOT / 'build/native-xi-runner'
WINDOWS = [240, 288, 864, 1440]


def scaled(value, scale=1):
    return math.floor(value * scale + 0.5)


def compile_program(rows, model='xn02'):
    n = len(rows)
    assert 64 <= n <= (240 if model == 'xn01' else 1440)
    lines = [f'set r15 {n}']
    for i, row in enumerate(rows):
        for base, value in [(1000000, scaled(row[4], 100)), (2000000, scaled(row[5]))]:
            for k in range(4):
                lines.append(f'store8 {base + i * 4 + k} {(value >> (8 * k)) & 255}')
        valid = i >= 6 and all(rows[j][0] - rows[j-1][0] == 300 for j in range(i-5, i+1))
        label = valid and i+1 < n and rows[i+1][0] - row[0] == 300
        lines += [f'store8 {2500000+i} {int(valid)}', f'store8 {2600000+i} {int(label)}']
    return (ASSETS / f'{model}-native.xi').read_text().replace('# __INPUT_BYTES__', '\n'.join(lines))


def execute(rows, model='xn02'):
    source = compile_program(rows, model)
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xi') as f:
        f.write(source)
        f.flush()
        run = subprocess.run([str(RUNNER), f.name], capture_output=True, text=True, check=True)
    return {r['register']: r['value'] for line in run.stdout.splitlines()
            if (r := json.loads(line)).get('type') == 'register'}


def oracle(rows):
    """Independent test oracle for the original integer formulas, never shipped as model."""
    c = [scaled(r[4], 100) for r in rows]
    v = [scaled(r[5]) for r in rows]
    def valid(i):
        return i >= 6 and all(rows[j][0]-rows[j-1][0] == 300 for j in range(i-5, i+1))
    def mask(i):
        return (int(c[i] >= c[i-1]) + 2*int(c[i] >= c[i-3]) +
                4*int(abs(c[i]-c[i-1])*6 > sum(abs(c[j]-c[j-1]) for j in range(i-5, i+1))) +
                8*int(v[i]*6 > sum(v[i-5:i+1])))
    current = mask(len(rows)-1)
    eligible = [i for i in range(6, len(rows)-1) if valid(i) and rows[i+1][0]-rows[i][0] == 300]
    same = [i for i in eligible if mask(i) == current]
    up = lambda i: c[i+1] > c[i]
    prior = (sum(map(up, eligible))+1)*10000//(len(eligible)+2)
    p = (sum(map(up, same))*10000+8*prior)//(len(same)+8)
    return dict(zip(['r0','r8','r9','r3','r7','r6','r10'],
                    [current,p,int(p >= 5000),len(same),prior,len(eligible),max(p,10000-p)]))


def test_native(rows):
    for end in [2000, 4000, len(rows)]:
        sample = rows[end-240:end]
        assert execute(sample, 'xn01') == execute(sample) == oracle(sample)
    for n in WINDOWS:
        assert execute(rows[-n:]) == oracle(rows[-n:])
    # Worst-case counter support and all four counters >255; no u8 overflow.
    for slope in [0, 1, -1]:
        sample = [[1800000000+i*300, 9000+i*slope, 11000+i*slope,
                   10000+i*slope, 10000+i*slope, 10] for i in range(1440)]
        actual = execute(sample)
        assert actual == oracle(sample), (slope, actual, oracle(sample))
        assert actual['r3'] == actual['r6'] == 1433
    sample = [r[:] for r in rows[-864:]]
    for r in sample[400:]:
        r[0] += 300
    assert execute(sample) == oracle(sample)
    print('XI native: parity XN01, u32 counters, 1440-row worst case and gaps OK', flush=True)


def score(cases):
    n = len(cases)
    bins = []
    for lower, upper in [(0.5,0.55),(0.55,0.6),(0.6,0.7),(0.7,1.0001)]:
        subset = [c for c in cases if lower <= c['confidence'] < upper]
        bins.append({'from': lower, 'to': min(upper,1), 'cases':len(subset),
                     'correct':sum(c['correct'] for c in subset)})
    return {'cases':n,'correct':sum(c['correct'] for c in cases),
            'accuracy':sum(c['correct'] for c in cases)/n,
            'brier':sum((c['p']-c['actual_up'])**2 for c in cases)/n,
            'prior_brier':sum((c['prior']-c['actual_up'])**2 for c in cases)/n,
            'coin_brier':0.25, 'confidence_bins':bins}


def study(rows):
    # Fixed chronological split: select on validation, then open the test block.
    test_start = len(rows)-513
    validation_origins = list(range(test_start-256, test_start, 4))
    test_origins = list(range(test_start, len(rows)-1, 4))
    results = {w:{} for w in WINDOWS}
    detail = []
    selected = None
    for split, origins in [('validation',validation_origins),('test',test_origins)]:
        for window in WINDOWS:
            cases = []
            for origin in origins:
                train = rows[origin-window+1:origin+1]
                assert train[-1][0]+300 == rows[origin+1][0]
                output = execute(train)
                actual = int(scaled(rows[origin+1][4],100) > scaled(rows[origin][4],100))
                case = {'split':split,'window':window,'origin':rows[origin][0],
                        'target':rows[origin+1][0], 'p':output['r8']/10000,
                        'prior':output['r7']/10000,'confidence':output['r10']/10000,
                        'actual_up':actual,'correct':int(output['r9']==actual),
                        'support':output['r3'],'training_rows':output['r6']}
                cases.append(case)
            results[window][split] = score(cases)
            detail.extend(cases)
            print(split,window,json.dumps(results[window][split]),flush=True)
        if split == 'validation':
            selected = min(WINDOWS,key=lambda w:(results[w]['validation']['brier'],w))
    evidence = {'schema':'laplace-xn02-native-window-study-v1',
                'dataset_sha256':hashlib.sha256(DATA.read_bytes()).hexdigest(),
                'template_sha256':hashlib.sha256((ASSETS/'xn02-native.xi').read_bytes()).hexdigest(),
                'runtime':'mundo_x::QuantumRuntime; pinned original XI/Ether',
                'mundo_x_commit':'e2778d962af22f6f1a0794058dd4685fc2573966',
                'reverse_pc_commit':'45f7230bb6383f383c3bbea543f6199563f7cd32',
                'data_cutoff':json.loads(DATA.read_text())['cutoff'],
                'retrospective':True,'prospectively_validated':False,
                'stride_bars':4,'target_bars':1,'validation_cases':len(validation_origins),
                'test_cases':len(test_origins),'selection_metric':'validation Brier; lower is better',
                'selected_window':selected,'windows':results,
                'internal_confidence_is_accuracy':False,'automatic_trading':False,
                'limits':'One BTC period, overlapping training windows; no authenticated past vintages. '
                         '58% confidence is not 58% proven accuracy. Ties count as no upward movement.'}
    destination = ROOT/'evidencia/xn02-ventanas'
    destination.mkdir(exist_ok=True)
    (destination/'resultados.json').write_text(json.dumps({'evidence':evidence,'cases':detail},indent=2)+'\n')
    (ASSETS/'xn02-evidence.js').write_text('window.LAPLACE_XN02_EVIDENCE = '+json.dumps(evidence,ensure_ascii=False,indent=2)+';\n')
    print('Selected on validation only:',selected,flush=True)


if __name__ == '__main__':
    bars = json.loads(DATA.read_text())['rows']
    test_native(bars)
    if '--study' in sys.argv:
        study(bars)
