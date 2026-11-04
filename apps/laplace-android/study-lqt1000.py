"""Native LQT-1000 study; real archived OHLCV and explicit test-only fixtures.

Build build/lqt-runner and build/lqt-native first. No Python learner/simulator.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import sys
import math

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'evidencia/entrenamiento-x002-20261030/velas.json'
CPP = ROOT / 'apps/laplace-android/app/src/main/cpp/laplace_temporal.hpp'
RUNNER = ROOT / 'build/lqt-runner'
OUT = ROOT / 'evidencia/lqt1000'


def program(rows, horizon=3, mode='quantum', asof=None):
    asof = asof or rows[-1][0] + 300
    return (f'lqt.configure BTC-USD 300 {horizon} crypto {asof} {mode}\n' +
            ''.join('lqt.candle ' + ' '.join(map(str, r[:6])) + ' 0\n' for r in rows) + 'lqt.run\n')


def execute(rows, horizon=3, mode='quantum', checkpoint=None, asof=None, expect_error=False):
    with tempfile.TemporaryDirectory(prefix='lqt-') as directory:
        source = Path(directory) / 'model.xi'
        source.write_text(program(rows, horizon, mode, asof))
        command = [str(RUNNER), str(source)]
        if checkpoint is not None:
            state = Path(directory) / 'state.lqt'
            state.write_text(checkpoint)
            command.append(str(state))
        result = subprocess.run(command, capture_output=True, text=True, timeout=45)
        if expect_error:
            assert result.returncode != 0, 'invalid request accepted'
            return result.stderr.strip()
        assert result.returncode == 0, result.stderr
        return json.loads(result.stdout)


def parameters(checkpoint):
    # Header/time/metrics are deliberately excluded: these are circuit/readout
    # parameters and data-gradient participation counters, in native format.
    return '\n'.join(checkpoint.splitlines()[2:6])


def main():
    archived = json.loads(SOURCE.read_text())['rows']
    # Initial historical fit at an earlier cutoff, followed by genuinely later
    # archived labels. It is a retrospective replay, not a prospective claim.
    rows = archived[-4032:]
    initial = execute(rows[:-24])
    restored = execute(rows[:-24], checkpoint=initial['checkpoint'])
    assert restored['checkpoint'] == initial['checkpoint']
    assert restored['outputs'] == initial['outputs']
    continued = execute(rows, checkpoint=initial['checkpoint'])
    assert continued['onlineUpdates'] == 8
    assert continued['updates'] == initial['updates'] + 8
    assert parameters(continued['checkpoint']) != parameters(initial['checkpoint'])
    repeated = execute(rows, checkpoint=continued['checkpoint'])
    assert repeated['checkpoint'] == continued['checkpoint']
    assert repeated['onlineUpdates'] == 0
    assert repeated['outputs'] == continued['outputs']
    # Perturb only held-out TEST outcomes; learned parameters, topology and
    # calibration must be identical. Refit occurs from the same deterministic seed.
    changed = [r[:] for r in rows]
    test_start = len(changed)*85//100
    for row in changed[test_start:]:
        for column in [1,2,3,4]:
            row[column] *= 1.03
        row[5] *= 1.4
    original = execute(rows)
    future_changed = execute(changed)
    assert parameters(original['checkpoint']) == parameters(future_changed['checkpoint'])
    assert original['selectedTemporalLag'] == future_changed['selectedTemporalLag']
    assert original['checkpoint'].splitlines()[6:8] == future_changed['checkpoint'].splitlines()[6:8]
    assert original['checkpoint'].splitlines()[:8] == future_changed['checkpoint'].splitlines()[:8]
    errors = {
        'unclosed': execute(rows, asof=rows[-1][0]+299, expect_error=True),
        'expired': execute(rows, asof=rows[-1][0]+300+900, expect_error=True),
        'checkpoint_context': execute(rows, horizon=6, checkpoint=original['checkpoint'], expect_error=True),
        'checkpoint_trailing': execute(rows, checkpoint=original['checkpoint']+'unexpected', expect_error=True),
    }
    gap = [r[:] for r in rows]
    for row in gap[-100:]:
        row[0] += 300
    errors['recent_gap'] = execute(gap, expect_error=True)
    results = []
    for horizon in [1,3,6,12,24]:
        quantum = original if horizon == 3 else execute(rows, horizon=horizon)
        classical = execute(rows, horizon=horizon, mode='classical')
        state = quantum.pop('checkpoint')
        classical.pop('checkpoint')
        results.append({'minutes': horizon*5, 'quantum': quantum,
                        'matchedClassical': classical,
                        'checkpointSHA256': hashlib.sha256(state.encode()).hexdigest()})
        print(json.dumps({'minutes':horizon*5,'test':quantum['test'],
                          'matchedClassical':classical['test']}), flush=True)
    native = json.loads(subprocess.check_output([str(ROOT/'build/lqt-native')], text=True))
    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        'schema':'laplace-lqt1000-study-v1','source':str(SOURCE.relative_to(ROOT)),
        'sourceSHA256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'algorithmSHA256':hashlib.sha256(CPP.read_bytes()).hexdigest(),
        'rows':len(rows),'firstOpen':rows[0][0],'lastClose':rows[-1][0]+300,
        'protocol':{'train':.60,'selection':.15,'calibration':.10,'test':.15,
                    'epochs':[1,2,3,4],'temporalLags':[0,3,12],
                    'selection':'validation only; initial test never enters online learning',
                    'nonoverlappingLabelsWithinEachSplit':True,
                    'intervalNominalCoverage':.80,
                    'matchedClassical':'same parameters and training; entangling CZ removed'},
        'nativeVerification':native,
        'retention':{'saveReloadIdentical':True,'laterUpdates':continued['onlineUpdates'],
                     'repeatedLabelsNotLearnedTwice':True,'testPerturbationDoesNotTrain':True},
        'rejectedRequests':errors,'horizons':results,
        'prospectivelyValidated':False,'physicalQPU':False,'automaticTrading':False,
        'scope':'one archived BTC period; host timings are not Android device timings',
    }
    if '--verify' in sys.argv:
        frozen = json.loads((OUT/'resultados.json').read_text())
        assert frozen['sourceSHA256'] == report['sourceSHA256']
        assert frozen['algorithmSHA256'] == report['algorithmSHA256']
        for actual, expected in zip(report['horizons'], frozen['horizons']):
            assert actual['minutes'] == expected['minutes']
            for mode in ['quantum','matchedClassical']:
                a,b=actual[mode]['test'],expected[mode]['test']
                assert a['cases']==b['cases'] and a['directionCorrect']==b['directionCorrect']
                assert math.isclose(a['brier'],b['brier'],rel_tol=1e-9,abs_tol=1e-9)
                for x,y in zip(a['outputs'],b['outputs']):
                    for key in ['mae','baselineMAE','intervalCoverage']:
                        assert math.isclose(x[key],y[key],rel_tol=1e-9,abs_tol=1e-9),(mode,key,x,y)
    else:
        (OUT/'resultados.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print('Native chronology, retention, rejection and held-out perturbation tests passed.',flush=True)


if __name__ == '__main__':
    main()
