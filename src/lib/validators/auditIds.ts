import type { CountryCode, PersonType } from '../../app/types';

type DemoAuditSession = { onboardingId: string; attempts: Record<string, number> };
const memoryStorage = new Map<string, string>();

function read(key: string): string | null {
  try {
    return memoryStorage.get(key) ?? localStorage.getItem(key) ?? null;
  } catch {
    return memoryStorage.get(key) ?? null;
  }
}

function write(key: string, value: string) {
  memoryStorage.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Demo IDs still work within this page when browser storage is unavailable.
  }
}

function next(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value + 1 : 1;
}

export function createDemoAuditIds(country: CountryCode, personType: PersonType, document: string, sessionId: string) {
  const prefix = `${country.toUpperCase()}-${personType === 'natural' ? 'PN' : 'PJ'}`;
  const sessionKey = `demo_audit_session:${prefix}:${sessionId}`;
  let session: DemoAuditSession | null = null;
  try {
    const stored = JSON.parse(read(sessionKey) ?? 'null');
    if (typeof stored?.onboardingId === 'string' && stored.onboardingId.startsWith(`${prefix}-`) && stored.attempts && typeof stored.attempts === 'object' && !Array.isArray(stored.attempts)) {
      session = stored;
    }
  } catch {
    // An unreadable demo session gets a fresh number, not a reused one.
  }
  if (!session) {
    const counterKey = `demo_audit_sequence:${prefix}`;
    const sequence = next(Number(read(counterKey)));
    write(counterKey, String(sequence));
    session = { onboardingId: `${prefix}-${String(sequence).padStart(6, '0')}`, attempts: {} };
  }
  const documentCode = ({
    rif: 'RIF', documentoFiscal: country === 've' ? 'RIF' : 'FISCAL',
    documentoIdentidad: country === 've' ? 'CI' : 'ID',
    documentoIdentidadReverso: country === 've' ? 'CI-REV' : 'ID-REV',
    registroMercantil: 'RM', documentoConstitucion: 'RM',
    cedulaRepresentante: 'REP', documentoRepresentante: 'REP',
    facultadesRepresentante: 'PODER', actaDesignacionAutoridades: 'ACTA',
    comprobanteDomicilio: 'DOM', licenciaConducirFrente: 'LIC', licenciaConducirReverso: 'LIC-REV',
    referenciaPersonal: 'REF-PER', referenciaComercial: 'REF-COM', referenciaBancaria: 'REF-BAN'
  } as Record<string, string>)[document] ?? 'DOC';
  const attempt = next(session.attempts[documentCode]);
  session.attempts[documentCode] = attempt;
  write(sessionKey, JSON.stringify(session));
  return {
    onboardingId: session.onboardingId,
    auditId: `${session.onboardingId}-${documentCode}-${String(attempt).padStart(2, '0')}`
  };
}
