"""Canonical fixture recipe. Uses the existing AI simulator, never R or a database."""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'packages/testing/fixtures/irt-delivery-v1'


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def build(ai, small=False):
    sys.path.insert(0, str(ai))
    from research.irt.synthetic import generate
    from numora_service.irt_contracts import validate_input
    recipe = json.loads((FIXTURES / 'recipe.json').read_text(encoding='utf-8'))
    for name, pin in recipe['sourceSha256'].items():
        if hashlib.sha256((ai / name).read_bytes().replace(b'\r\n', b'\n')).hexdigest() != pin:
            raise ValueError('FIXTURE_SOURCE_PIN_MISMATCH: ' + name)
    files = {}
    summaries = []
    for case in recipe['cases']:
        # Generate the registered design first; subset afterwards preserves its item parameters.
        value, truth = generate(max(case['perArm']), case['seed'], 'MIXED', len(case['perArm']), include_mcma=True)
        counts = [2] * len(case['perArm']) if small else case['perArm']
        selected = []
        for package, count in zip(value['packages'], counts):
            selected.extend([p for p in value['respondents'] if p['deliveredArmId'] == package['armId']][:count])
        ids = {p['attemptId'] for p in selected}
        value['respondents'] = selected
        value['responses'] = [r for r in value['responses'] if r['attemptId'] in ids]
        # Distinct frozen request identities per case; IDs remain synthetic and deterministic.
        from uuid import UUID, uuid5
        namespace = UUID(recipe['namespace'])
        for key in ['requestId', 'snapshotId', 'calibrationId']:
            value[key] = str(uuid5(namespace, case['name'] + ':' + key))
        validate_input(value)
        truth = deepcopy(truth)
        truth['theta'] = {key: number for key, number in truth['theta'].items() if key in ids}
        files[case['name'] + '.input.json'] = encoded(value)
        files[case['name'] + '.truth.json'] = encoded(truth)
        summaries.append({'case': case['name'], 'participants': counts, 'responses': len(value['responses']),
                          'fullDesignParticipants': case['perArm'], 'scientificGate': 'NOT_EVALUATED'})
    profile = json.loads((ai / 'research/irt/policy-v1.json').read_text(encoding='utf-8'))
    files['research-resources.json'] = encoded({
        'purpose': 'RESEARCH_ONLY', 'productionApproved': False,
        'definitions': {key: profile[source] for key, source in [
            ('model', 'engine'), ('quality', 'quality'), ('eligibility', 'eligibility'),
            ('scoring', 'scoring'), ('scoreMapping', 'mapping')]},
        'approvalBinding': 'DISPOSABLE_DATABASE_ONLY',
        'inputDigestBinding': 'POSTGRES_PG_JSONB_IRT_RESEARCH_V1_REQUIRED',
        'fallback': {'owner': 'MAIN', 'readiness': 'BLOCKED_UNAPPROVED', 'policyRef': None}})
    files['manifest.json'] = encoded({
        'version': 'irt-delivery-fixtures-v1', 'purpose': 'SYNTHETIC_ONLY', 'canonicalOwner': 'Numora',
        'small': small, 'productionApproved': False, 'inputDigests': 'UNBOUND_UNTIL_POSTGRES_FREEZE',
        'cases': summaries, 'sourceSha256': recipe['sourceSha256'],
        'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}})
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ai-repo', type=Path, default=ROOT.parent / 'Numora-ai-service')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--small', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    files = build(args.ai_repo.resolve(), args.small)
    if args.check:
        for name, data in files.items():
            if (args.output / name).read_bytes() != data:
                raise ValueError('FIXTURE_BYTES_MISMATCH: ' + name)
    else:
        args.output.mkdir(parents=True, exist_ok=True)
        for name, data in files.items():
            (args.output / name).write_bytes(data)
    print(json.dumps({'files': len(files), 'small': args.small, 'verified': args.check, 'scientificGate': 'NOT_EVALUATED'}))


if __name__ == '__main__':
    main()
