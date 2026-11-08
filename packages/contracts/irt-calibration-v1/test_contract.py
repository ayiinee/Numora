"""Run with python path/to/test_contract.py; no Node, database, Redis or service needed."""
import copy
import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

from validate import SCHEMAS, validate_input, validate_result

ROOT = Path(__file__).resolve().parent


def read(name):
    return json.loads((ROOT / name).read_text(encoding='utf-8'))


def change(targets, patch):
    at = targets[patch['target']]
    for key in patch['path'][:-1]:
        at = at[key]
    key = patch['path'][-1]
    if patch['op'] == 'remove':
        del at[key]
    elif patch['op'] == 'append':
        at[key].append(copy.deepcopy(patch['value']))
    else:
        at[key] = copy.deepcopy(patch['value'])


class ContractTests(unittest.TestCase):
    def test_schemas_are_valid(self):
        for schema in SCHEMAS.values():
            Draft202012Validator.check_schema(schema)

    def test_shared_conformance_vectors(self):
        vectors = read('conformance.fixture.json')['cases']
        for vector in vectors:
            with self.subTest(vector=vector['name']):
                targets = {'input': read(vector['input']), 'result': read(vector['result']) if vector['result'] else None,
                           'dispatch': read('dispatch.fixture.json')}
                for patch in vector['patches']:
                    change(targets, patch)
                def run():
                    return validate_input(targets['input']) if vector['kind'] == 'input' else validate_result(
                        targets['result'], targets['input'], targets['dispatch'])
                if vector['expectedError']:
                    with self.assertRaisesRegex(ValueError, '^' + vector['expectedError'] + '$'):
                        run()
                else:
                    run()

    def test_nonfinite_numbers(self):
        value = read('examples/drill-input.json')
        output = read('examples/drill-result.json')
        for number in (float('nan'), float('inf'), float('-inf')):
            output['outcome']['items'][0]['parameters']['discriminationA'] = number
            with self.assertRaisesRegex(ValueError, '^IRT_SCHEMA_INVALID$'):
                validate_result(output, value, read('dispatch.fixture.json'))


if __name__ == '__main__':
    unittest.main()
