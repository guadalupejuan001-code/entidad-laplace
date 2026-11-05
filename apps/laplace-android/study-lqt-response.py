"""Evidence for correction C01: new inputs, learned rotations and matched CZ ablation.

The synthetic interaction test is a representation/learning test. It cannot
establish a quantum speedup or a trading advantage. Market scores are reported
without a forced-direction rule or a test-selected winning model.
"""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import importlib.util

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'evidencia/lqt1000/respuesta-c01.json'
spec = importlib.util.spec_from_file_location('lqt_study', Path(__file__).with_name('study-lqt1000.py'))
study = importlib.util.module_from_spec(spec)
spec.loader.exec_module(study)


def same_numbers(a, b):
    if isinstance(a, dict):
        assert a.keys() == b.keys()
        for key in a:
            same_numbers(a[key], b[key])
    elif isinstance(a, list):
        assert len(a) == len(b)
        for x, y in zip(a, b):
            same_numbers(x, y)
    elif isinstance(a, (int, float)) and not isinstance(a, bool):
        assert math.isclose(a, b, rel_tol=1e-8, abs_tol=1e-8), (a, b)
    else:
        assert a == b, (a, b)


def main():
    release = json.loads((ROOT / 'evidencia/lqt1000/resultados.json').read_text())
    controlled = json.loads(subprocess.check_output([str(ROOT / 'build/lqt-learning')], text=True))
    responses = []
    for horizon in [1, 3, 6, 12, 24]:
        result = subprocess.check_output([str(ROOT/'build/lqt-response'),
            str(ROOT/f'build/lqt-checkpoints/{horizon}.lqt'),
            str(ROOT/'build/lqt-checkpoints/bars.tsv')], text=True)
        response = json.loads(result)
        recorded = next(h['quantum']['test'] for h in release['horizons'] if h['minutes'] == horizon*5)
        same_numbers(response['test'], recorded)
        assert response['test']['predictedUp'] > 0 and response['test']['predictedDown'] > 0
        assert response['meanAbsoluteNormalizedPriceResponse'] > .001
        assert response['maxThetaChangeRadians'] > .01
        responses.append(response)
    # An additional, disjoint earlier period was excluded from the v1 LQT
    # study. The algorithm/optimizer are fixed before this evaluation.
    # It is still retrospective and from the same underlying BTC archive.
    all_rows = json.loads((ROOT / release['source']).read_text())['rows']
    earlier = all_rows[:-4032]
    earlier_results = []
    for horizon in [1, 3, 6, 12, 24]:
        pair = {}
        for mode in ['quantum', 'classical']:
            result = study.execute(earlier, horizon=horizon, mode=mode)
            pair[mode] = {'test':result['test'], 'updates':result['updates'],
                'updatedRotations':result['updatedRotations'], 'selectedTemporalLag':result['selectedTemporalLag']}
        earlier_results.append({'minutes':horizon*5, **pair})
    # Deliberately test finite gradients and exact optimizer/normalizer retention
    # through the same native execution path used in Android.
    result = {
        'schema':'laplace-lqt-response-c01-v1', 'algorithmVersion':2,
        'algorithmSHA256':release['algorithmSHA256'], 'sourceSHA256':release['sourceSHA256'],
        'controlledTestSHA256':hashlib.sha256((ROOT/'apps/laplace-android/tests/lqt-learning.cpp').read_bytes()).hexdigest(),
        'controlledInteraction':controlled, 'reusedMarketBenchmark':responses,
        'additionalArchivedPeriod':{'rows':len(earlier), 'firstOpen':earlier[0][0],
            'lastClose':earlier[-1][0]+300, 'horizons':earlier_results},
        'protocol':{'chosenWithoutMarketTestTuning':True,'forcedAlternatingDirections':False,
            'matchedNoCZTraining':'same parameter counts, optimizer, candidate budget and selection rules',
            'reusedTestCaveat':release['interpretation']},
        'prospectivelyValidated':False,'quantumSpeedupDemonstrated':False,
        'scope':'Controlled interaction demonstrates a useful circuit feature in this restricted family. BTC results are measured separately; no universal superiority claim.'
    }
    if '--verify' in sys.argv:
        same_numbers(result, json.loads(OUT.read_text()))
    else:
        OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'controlled':controlled,'responsiveMarketHorizons':sum(
        h['test']['predictedUp']>0 and h['test']['predictedDown']>0 for h in responses),
        'additionalArchivedPeriodRows':len(earlier)}), flush=True)


if __name__ == '__main__':
    main()
