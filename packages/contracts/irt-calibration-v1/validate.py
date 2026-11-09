"""Independent Python boundary validation; no calibration, database access or publication."""
import json
from datetime import datetime
from decimal import Decimal
from math import isfinite
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parent
BASE = 'urn:numora:irt-calibration-v1:'
SCHEMAS = {name: json.loads((ROOT / (name + '.schema.json')).read_text(encoding='utf-8'))
           for name in ('common', 'input', 'result')}
REGISTRY = Registry().with_resources((schema['$id'], Resource.from_contents(schema))
                                     for schema in SCHEMAS.values())
VALIDATORS = {name: Draft202012Validator(schema, registry=REGISTRY, format_checker=FormatChecker())
              for name, schema in SCHEMAS.items()}


def ensure(condition, code):
    if not condition:
        raise ValueError(code)


def shape(name, value):
    ensure(VALIDATORS[name].is_valid(value), 'IRT_SCHEMA_INVALID')
    # jsonschema accepts non-finite Python floats in some unconstrained number fields;
    # they cannot be represented by a standards-compliant JSON producer.
    try:
        json.dumps(value, allow_nan=False)
    except (ValueError, TypeError):
        raise ValueError('IRT_SCHEMA_INVALID') from None


def unique(rows, key):
    result = {}
    for row in rows:
        identifier = key(row) if callable(key) else row[key]
        ensure(identifier not in result, 'IRT_DUPLICATE_ID')
        result[identifier] = row
    return result


def pk(row):
    return row['packageId'], row['packageVersion']


def exact_coverage(rows, expected, key):
    found = unique(rows, key)
    ensure(set(found) == set(expected), 'IRT_COVERAGE_INVALID')
    return found


def timestamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def cents(value):
    return int(Decimal(value) * 100)


def quality(row):
    calibrated = row['measurementState'] == 'CALIBRATED'
    q = row['quality']
    ensure(not calibrated or (q['gate'] == 'PASSED' and len(q['checks']) > 0
                              and all(c['status'] == 'PASS' for c in q['checks'])), 'IRT_RESULT_STATE_INVALID')
    ensure((len(row['reasonCodes']) == 0) if calibrated else len(row['reasonCodes']) > 0, 'IRT_RESULT_STATE_INVALID')
    unique(q['checks'], 'code')


def validate_input(value):
    shape('input', value)
    drill = value['ecosystem'] == 'DRILL'
    context, window = value['context'], value['window']
    if drill:
        valid_context = (context['scope'] == 'LEVEL' and all(context[k] is not None for k in
                         ('chapterId', 'indicatorId', 'levelId')) and context['batchId'] is None
                         and context['scaleId'] == 'L:{chapterId}:{indicatorId}:{levelId}'.format(**context))
    else:
        valid_context = (context['scope'] == 'TRYOUT_BATCH' and context['batchId'] is not None
                         and all(context[k] is None for k in ('chapterId', 'indicatorId', 'levelId'))
                         and context['scaleId'] == 'T:' + context['batchId'])
    ensure(valid_context, 'IRT_CONTEXT_MISMATCH')
    start, close, grade = (timestamp(window[k]) for k in ('startsAt', 'collectionCutoffAt', 'gradingCutoffAt'))
    valid_due = window['resultDueAt'] is None if drill else (window['resultDueAt'] is not None and
                  close <= timestamp(window['resultDueAt']) and
                  (timestamp(window['resultDueAt']) - close).total_seconds() <= 72 * 3600)
    ensure(start <= close <= grade and valid_due, 'IRT_WINDOW_INVALID')
    items = unique(value['items'], 'questionVersionId')
    packages = unique(value['packages'], pk)
    arms = unique(value['packages'], 'armId')
    people = unique(value['respondents'], 'respondentId')
    unique(value['respondents'], 'attemptId')
    unique(value['responses'], 'attemptItemId')
    unique(value['comparisons'], 'comparisonId')
    ensure(len(value['anchorQuestionVersionIds']) == (3 if drill else 5), 'IRT_ANCHOR_INVALID')
    ensure(sum(p['armKind'] == 'ORIGINAL' for p in packages.values()) == 1 and
           any(p['armKind'] == 'VARIANT' for p in packages.values()), 'IRT_PACKAGE_INVALID')
    for item in items.values():
        original = items.get(item['originalQuestionVersionId'])
        ensure(original and original['originalQuestionVersionId'] == original['questionVersionId']
               and original['familyId'] == item['familyId'] and original['questionType'] == item['questionType'],
               'IRT_LINEAGE_INVALID')
        ensure(cents(item['maxPoints']) > 0 and ((item['modelFamily'] == '2PL' and
               item['maximumScoreCategory'] == 1) if item['questionType'] == 'SINGLE_CHOICE'
               else item['modelFamily'] == 'GPCM'), 'IRT_SCORE_INVALID')
    used = set()
    for package in packages.values():
        ids = package['questionVersionIds']
        ensure(len(ids) == (10 if drill else 30) and
               set(value['anchorQuestionVersionIds']) <= set(ids), 'IRT_PACKAGE_INVALID')
        families = set()
        for identifier in ids:
            item = items.get(identifier)
            ensure(item is not None, 'IRT_INVALID_REFERENCE')
            ensure(item['familyId'] not in families, 'IRT_PACKAGE_INVALID')
            families.add(item['familyId'])
            used.add(identifier)
            if package['armKind'] == 'ORIGINAL':
                ensure(item['originalQuestionVersionId'] == identifier, 'IRT_LINEAGE_INVALID')
    ensure(used == set(items), 'IRT_COVERAGE_INVALID')
    if drill or value['policies']['scoreMapping'] is None:
        ensure(value['referencePackage'] is None and len(value['referenceQuestionVersionIds']) == 0
               and (not drill or value['policies']['scoreMapping'] is None), 'IRT_POLICY_MISMATCH')
    else:
        package = packages.get(pk(value['referencePackage'])) if value['referencePackage'] else None
        ensure(package and package['armKind'] == 'ORIGINAL' and len(value['referenceQuestionVersionIds']) > 0
               and all(k in package['questionVersionIds'] and items[k]['contentState'] == 'CONTENT_VALID'
                       for k in value['referenceQuestionVersionIds']), 'IRT_POLICY_MISMATCH')
    ensure(not value['comparisons'] or value['policies']['comparison'] is not None, 'IRT_POLICY_MISMATCH')
    unique(value['comparisons'], lambda c: (c['originalQuestionVersionId'], c['variantQuestionVersionId']))
    for pair in value['comparisons']:
        a, b = items.get(pair['originalQuestionVersionId']), items.get(pair['variantQuestionVersionId'])
        ensure(a and b and a['questionVersionId'] != b['questionVersionId']
               and b['originalQuestionVersionId'] == a['questionVersionId'] and a['familyId'] == b['familyId']
               and a['questionVersionId'] not in value['anchorQuestionVersionIds']
               and b['questionVersionId'] not in value['anchorQuestionVersionIds'], 'IRT_LINEAGE_INVALID')
    expected_rows = set()
    for person in people.values():
        package = packages.get(pk(person))
        ensure(package and person['assignedArmId'] in arms, 'IRT_IDENTITY_MISMATCH')
        ensure(person['deliveredArmId'] == package['armId'] and person['batchId'] == context['batchId'],
               'IRT_IDENTITY_MISMATCH')
        if person['deliveryMode'] == 'ORIGINAL_FALLBACK':
            ensure(drill and package['armKind'] == 'ORIGINAL'
                   and arms[person['assignedArmId']]['armKind'] == 'VARIANT'
                   and person['assignedArmId'] != person['deliveredArmId'], 'IRT_ASSIGNMENT_INVALID')
        else:
            ensure(person['assignedArmId'] == person['deliveredArmId'], 'IRT_ASSIGNMENT_INVALID')
        ensure(start <= timestamp(person['submittedAt']) <= close and
               timestamp(person['submittedAt']) <= timestamp(person['gradedAt']) <= grade, 'IRT_WINDOW_INVALID')
        expected_rows.update((person['attemptId'], k) for k in package['questionVersionIds'])
    rows = unique(value['responses'], lambda r: (r['attemptId'], r['questionVersionId']))
    ensure(set(rows) == expected_rows, 'IRT_COVERAGE_INVALID')
    for row in rows.values():
        person, item = people.get(row['respondentId']), items.get(row['questionVersionId'])
        ensure(person and person['attemptId'] == row['attemptId'] and item
               and item['rubricVersionId'] == row['rubricVersionId'], 'IRT_IDENTITY_MISMATCH')
        scored = row['responseState'] in ('RESPONDED', 'OMITTED')
        if scored:
            ensure(row['scoreCategory'] is not None and row['scoreCategory'] <= item['maximumScoreCategory']
                   and row['awardedPoints'] is not None, 'IRT_SCORE_INVALID')
            awarded, maximum, m = cents(row['awardedPoints']), cents(item['maxPoints']), int(item['maximumScoreCategory'])
            ensure(awarded <= maximum and abs(awarded * m - int(row['scoreCategory']) * maximum) * 2 <= m,
                   'IRT_SCORE_INVALID')
        else:
            ensure(row['scoreCategory'] is None and row['awardedPoints'] is None, 'IRT_SCORE_INVALID')
        ensure(row['responseState'] != 'OMITTED' or row['scoreCategory'] == 0 and cents(row['awardedPoints']) == 0,
               'IRT_SCORE_INVALID')
        ensure((len(row['priorExposureSources']) > 0) if row['exposureState'] == 'KNOWN_PRIOR'
               else len(row['priorExposureSources']) == 0, 'IRT_ELIGIBILITY_INVALID')
        reasons = set(row['eligibilityReasons'])
        included = row['includedInCalibration']
        ensure(person['firstValidAttempt'] or not included and 'RETRY' in reasons, 'IRT_ELIGIBILITY_INVALID')
        ensure(person['deliveryMode'] != 'ORIGINAL_FALLBACK' or not included and 'ARM_CROSSOVER' in reasons,
               'IRT_ELIGIBILITY_INVALID')
        ensure(scored or not included and ('TECHNICAL_INVALID' if row['responseState'] == 'INVALID'
                                          else 'NOT_PRESENTED') in reasons, 'IRT_ELIGIBILITY_INVALID')
        ensure(item['contentState'] != 'INVALID' or not included and 'CONTENT_INVALID' in reasons,
               'IRT_ELIGIBILITY_INVALID')
        ensure(row['exposureState'] != 'UNKNOWN' or 'UNKNOWN_EXPOSURE' in reasons, 'IRT_ELIGIBILITY_INVALID')
        if included:
            ensure('FIRST_VALID_ATTEMPT' in reasons, 'IRT_ELIGIBILITY_INVALID')
            ensure(not reasons.intersection({'RETRY', 'ARM_CROSSOVER', 'TECHNICAL_INVALID', 'NOT_PRESENTED',
                                             'CONTENT_INVALID', 'PRIOR_EXPOSURE'}), 'IRT_ELIGIBILITY_INVALID')
            if row['exposureState'] == 'KNOWN_PRIOR':
                ensure(drill and 'DRILL' not in row['priorExposureSources']
                       and 'BETA_PRIOR_EXPOSURE_ALLOWED' in reasons, 'IRT_ELIGIBILITY_INVALID')
        if 'BETA_PRIOR_EXPOSURE_ALLOWED' in reasons:
            ensure(drill and row['exposureState'] == 'KNOWN_PRIOR', 'IRT_ELIGIBILITY_INVALID')
    return value


def validate_result(output, value, expected_dispatch):
    validate_input(value)
    shape('result', output)
    ensure(isinstance(expected_dispatch, dict) and isinstance(expected_dispatch.get('executionId'), str)
           and type(expected_dispatch.get('dispatchGeneration')) in (int, float)
           and 1 <= expected_dispatch['dispatchGeneration'] <= 9007199254740991
           and isfinite(expected_dispatch['dispatchGeneration'])
           and expected_dispatch['dispatchGeneration'] == int(expected_dispatch['dispatchGeneration'])
           and expected_dispatch['dispatchGeneration'] >= 1
           and output['executionId'] == expected_dispatch['executionId']
           and output['dispatchGeneration'] == expected_dispatch['dispatchGeneration'], 'IRT_STALE_EXECUTION')
    for key in ('requestId', 'snapshotId', 'inputDigest', 'calibrationId', 'context'):
        ensure(output[key] == value[key], 'IRT_INPUT_MISMATCH')
    ensure(timestamp(output['completedAt']) >= timestamp(value['window']['gradingCutoffAt']), 'IRT_WINDOW_INVALID')
    if output['executionStatus'] == 'FAILED':
        ensure(output['outcome'] is None and output['failure'] is not None, 'IRT_RESULT_STATE_INVALID')
        ensure(output['failure']['retryable'] == (output['failure']['code'] in ('TIMEOUT', 'DEPENDENCY_UNAVAILABLE')),
               'IRT_RESULT_STATE_INVALID')
        return output
    ensure(output['failure'] is None and output['outcome'] is not None, 'IRT_RESULT_STATE_INVALID')
    outcome = output['outcome']
    items = {item['questionVersionId']: item for item in value['items']}
    packages = {pk(p): p for p in value['packages']}
    results = exact_coverage(outcome['items'], items, 'questionVersionId')
    package_results = exact_coverage(outcome['packages'], packages, pk)
    comparisons = exact_coverage(outcome['comparisons'], {c['comparisonId']: c for c in value['comparisons']}, 'comparisonId')
    people = {r['attemptId']: r for r in value['respondents']} if value['ecosystem'] == 'TRYOUT' else {}
    exact_coverage(outcome['respondents'], people, 'attemptId')
    unique(outcome['respondents'], 'respondentId')
    counts = {identifier: 0 for identifier in items}
    for row in value['responses']:
        if row['includedInCalibration']:
            counts[row['questionVersionId']] += 1
    for row in results.values():
        item = items[row['questionVersionId']]
        quality(row)
        ensure(row['rubricVersionId'] == item['rubricVersionId'] and row['modelFamily'] == item['modelFamily'],
               'IRT_IDENTITY_MISMATCH')
        ensure(row['eligibleRespondentCount'] == counts[row['questionVersionId']], 'IRT_ELIGIBILITY_INVALID')
        calibrated, p = row['measurementState'] == 'CALIBRATED', row['parameters']
        ensure((p is not None and item['contentState'] == 'CONTENT_VALID' and row['eligibleRespondentCount'] > 0)
               if calibrated else p is None, 'IRT_PARAMETERS_INVALID')
        if p is not None:
            ensure((p['difficultyB'] is not None and p['difficultyStandardError'] is not None and len(p['steps']) == 0)
                   if item['modelFamily'] == '2PL' else (p['difficultyB'] is None and p['difficultyStandardError'] is None
                   and len(p['steps']) == item['maximumScoreCategory']
                   and all(s['step'] == i + 1 for i, s in enumerate(p['steps']))), 'IRT_PARAMETERS_INVALID')
    anchors_passed = all(results[k]['measurementState'] == 'CALIBRATED' for k in value['anchorQuestionVersionIds'])
    for row in package_results.values():
        quality(row)
        if row['measurementState'] == 'CALIBRATED':
            ensure(anchors_passed and any(results[k]['measurementState'] == 'CALIBRATED'
                   for k in packages[pk(row)]['questionVersionIds']), 'IRT_RESULT_STATE_INVALID')
    states = [p['measurementState'] for p in package_results.values()]
    n = states.count('CALIBRATED')
    expected = ('CALIBRATED' if n == len(states) else 'PARTIAL' if n > 0 else 'ANOMALY' if 'ANOMALY' in states
                else 'NOT_COMPARABLE' if 'NOT_COMPARABLE' in states else 'INSUFFICIENT')
    ensure(outcome['measurementState'] == expected, 'IRT_RESULT_STATE_INVALID')
    for row in outcome['respondents']:
        person = people[row['attemptId']]
        ensure(all(row[k] == person[k] for k in ('respondentId', 'attemptId', 'packageId', 'packageVersion', 'batchId')),
               'IRT_IDENTITY_MISMATCH')
        if row['status'] == 'SCORED':
            ensure(value['policies']['scoreMapping'] is not None and row['scoreMapping'] == value['policies']['scoreMapping']
                   and row['referencePackage'] == value['referencePackage'], 'IRT_POLICY_MISMATCH')
            ensure(all(row[k] is not None for k in ('theta', 'standardError', 'score'))
                   and len(row['usedQuestionVersionIds']) > 0
                   and len(row['reasonCodes']) == 0
                   and package_results[pk(row)]['measurementState'] == 'CALIBRATED', 'IRT_RESULT_STATE_INVALID')
            delivered = packages[pk(row)]['questionVersionIds']
            ensure(all(k in delivered and results[k]['measurementState'] == 'CALIBRATED'
                       and any(a['attemptId'] == row['attemptId'] and a['questionVersionId'] == k
                               and a['responseState'] in ('RESPONDED', 'OMITTED') for a in value['responses'])
                       for k in row['usedQuestionVersionIds'])
                   and all(results[k]['measurementState'] == 'CALIBRATED' for k in value['referenceQuestionVersionIds']),
                   'IRT_INVALID_REFERENCE')
        else:
            ensure(all(row[k] is None for k in ('theta', 'standardError', 'score', 'scoreMapping', 'referencePackage'))
                   and len(row['usedQuestionVersionIds']) == 0 and len(row['reasonCodes']) > 0, 'IRT_RESULT_STATE_INVALID')
            if row['status'] == 'UNSCORABLE':
                ensure(all(items[k]['contentState'] == 'INVALID' or any(a['attemptId'] == row['attemptId']
                           and a['questionVersionId'] == k and a['responseState'] in ('INVALID', 'NOT_PRESENTED')
                           for a in value['responses']) for k in packages[pk(row)]['questionVersionIds']),
                       'IRT_RESULT_STATE_INVALID')
    for pair in value['comparisons']:
        row, source = comparisons[pair['comparisonId']], items[pair['originalQuestionVersionId']]
        unique(row['metrics'], 'name')
        for metric in row['metrics']:
            ensure(metric['interval']['lower'] <= metric['interval']['upper'], 'IRT_PARAMETERS_INVALID')
        if row['decision'] in ('PASS', 'DRIFT'):
            ensure((len(row['reasonCodes']) == 0) if row['decision'] == 'PASS'
                   else 'MATERIAL_DRIFT' in row['reasonCodes'], 'IRT_RESULT_STATE_INVALID')
            ensure(value['policies']['comparison'] is not None and anchors_passed
                   and all(results[k]['measurementState'] == 'CALIBRATED'
                           for k in (pair['originalQuestionVersionId'], pair['variantQuestionVersionId'])),
                   'IRT_RESULT_STATE_INVALID')
            expected_metrics = {'DELTA_LOG_A', 'NORMALIZED_CURVE_GAP'} | ({'DELTA_B'} if source['modelFamily'] == '2PL' else set())
            ensure({m['name'] for m in row['metrics']} == expected_metrics, 'IRT_PARAMETERS_INVALID')
        else:
            ensure(len(row['reasonCodes']) > 0, 'IRT_RESULT_STATE_INVALID')
    return output
