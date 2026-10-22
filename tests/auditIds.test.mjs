import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadAuditIds(storage = new Map(), blocked = false) {
  const module = { exports: {} };
  const source = readFileSync(new URL('../src/lib/validators/auditIds.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  });
  vm.runInNewContext(outputText, {
    module, exports: module.exports,
    localStorage: {
      getItem(key) { if (blocked) throw new Error('Blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw new Error('Blocked'); storage.set(key, value); }
    }
  });
  return module.exports.createDemoAuditIds;
}

test('groups documents and counts each validation independently', () => {
  const ids = loadAuditIds();
  const rif = ids('ve', 'natural', 'documentoFiscal', 'session-1');
  const ci = ids('ve', 'natural', 'documentoIdentidad', 'session-1');
  const retry = ids('ve', 'natural', 'documentoFiscal', 'session-1');
  assert.equal(rif.onboardingId, 'VE-PN-000001');
  assert.equal(rif.auditId, 'VE-PN-000001-RIF-01');
  assert.equal(ci.auditId, 'VE-PN-000001-CI-01');
  assert.equal(retry.auditId, 'VE-PN-000001-RIF-02');
  assert.equal(ids('ve', 'natural', 'rif', 'session-2').onboardingId, 'VE-PN-000002');
});

test('preserves IDs and attempt counters across reloads', () => {
  const storage = new Map();
  loadAuditIds(storage)('ve', 'juridica', 'documentoConstitucion', 'session-1');
  const ids = loadAuditIds(storage);
  assert.equal(ids('ve', 'juridica', 'documentoConstitucion', 'session-1').auditId, 'VE-PJ-000001-RM-02');
  assert.equal(ids('ve', 'juridica', 'documentoFiscal', 'session-2').onboardingId, 'VE-PJ-000002');
});

test('separates countries and person types without changing document codes', () => {
  const ids = loadAuditIds();
  assert.equal(ids('ve', 'natural', 'documentoIdentidad', 'same-session').auditId, 'VE-PN-000001-CI-01');
  assert.equal(ids('ve', 'juridica', 'documentoRepresentante', 'same-session').auditId, 'VE-PJ-000001-REP-01');
  assert.equal(ids('usa', 'natural', 'licenciaConducirFrente', 'same-session').auditId, 'USA-PN-000001-LIC-01');
  assert.equal(ids('cl', 'natural', 'documentoIdentidadReverso', 'same-session').auditId, 'CL-PN-000001-ID-REV-01');
});

test('blocked browser storage does not prevent validation IDs', () => {
  const ids = loadAuditIds(new Map(), true);
  assert.equal(ids('ve', 'natural', 'documentoFiscal', 'session-1').auditId, 'VE-PN-000001-RIF-01');
  assert.equal(ids('ve', 'natural', 'documentoFiscal', 'session-1').auditId, 'VE-PN-000001-RIF-02');
});
