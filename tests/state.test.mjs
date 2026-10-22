import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadStateModule() {
  const storage = new Map();
  const module = { exports: {} };
  const source = readFileSync(new URL('../src/app/state.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  });
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    crypto: { randomUUID },
    console,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    }
  });
  return module.exports;
}

for (const [country, personType] of [['ve', 'natural'], ['ve', 'juridica'], ['cl', 'natural'], ['usa', 'natural']]) {
  test(`reload clears identity and files but preserves audit grouping: ${country}/${personType}`, () => {
    const { createInitialState, createEmptyPersonalInfo, saveState, loadState } = loadStateModule();
    const original = createInitialState('test-company', { name: 'Test Company' });
    original.country = country;
    original.personType = personType;
    original.personalInfo = Object.fromEntries(Object.keys(createEmptyPersonalInfo()).map(key => [key, 'previous value']));
    original.documents.rif = {
      type: 'rif', fileName: 'rif.pdf', fileBase64: 'fixture',
      validation: { status: 'valid', checks: [], extractedIdentity: { firstName: 'Previous name' } }
    };
    original.representatives[1].enabled = true;
    original.biometrics = { status: 'passed', score: 99 };
    original.submission = { status: 'success', registrationId: 'previous-submission' };
    saveState(original);

    const restored = loadState('test-company');
    assert.equal(JSON.stringify(restored.personalInfo), JSON.stringify(createEmptyPersonalInfo()));
    assert.equal(restored.country, country);
    assert.equal(restored.personType, personType);
    assert.equal(restored.onboardingId, original.onboardingId);
    assert.ok(Object.values(restored.documents).every(doc => !doc.fileName && doc.validation.status === 'pending'));
    assert.ok(restored.representatives.every(rep => !rep.document.fileName));
    assert.equal(restored.representatives[1].enabled, true);
    assert.equal(restored.biometrics.status, 'pending');
    assert.equal(restored.submission.status, 'idle');
    assert.equal(original.personalInfo.firstName, 'previous value');
  });
}

test('reload clears identity from legacy Chile sessions without a RUN field', () => {
  const { createInitialState, saveState, loadState } = loadStateModule();
  const original = createInitialState('test-company', { name: 'Test Company' });
  original.country = 'cl';
  original.personalInfo = { firstName: 'Previous name', lastName: 'Previous surname', documentNumber: '12.345.678-9' };
  saveState(original);
  const restored = loadState('test-company');
  assert.ok(Object.values(restored.personalInfo).every(value => value === ''));
});
