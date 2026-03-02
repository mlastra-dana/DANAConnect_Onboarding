export type FieldError = { field: string; message: string };

type HeaderMap = Record<string, string>;

export const TEMPLATE_HEADERS = [
  'CEDULA',
  'NOMBRE',
  'APELLIDO',
  'FECHA_NACIMIENTO',
  'SEXO',
  'DIRECCION_HABITACION',
  'TELF_HABITACION',
  'TELF_OFICINA',
  'TELF_MOVIL',
  'EMAIL',
  'PAIS_NACIMIENTO',
  'CIUDAD_NACIMIENTO',
  'FECHA_INGRESO_EMPRESA',
  'CARGO_ACTUAL',
  'ANTIGUEDAD_CARGO',
  'FICHA_TRABAJADOR',
  'TIPO_PACIENTE',
  'TURNO_TRABAJO',
  'NOMBRE_EMPRESA',
  'NOMBRE_DEPENDENCIA',
  'STATUS'
] as const;

const HEADER_ALIASES: Record<string, string[]> = {
  ANTIGUEDAD_CARGO: ['ANTIGUEDAD_CARGO', 'ANTIGUEDAD_EN_CARGO']
};

const TIPO_PACIENTE_VALUES = new Set(
  [
    'OBRERO',
    'PASANTE',
    'APRENDIZ',
    'ASOCIADO',
    'EMPLEADO',
    'EMPLEADA',
    'VISITANTE',
    'PARTICULAR',
    'CONTRATADO',
    'CONTRATISTA',
    'FAMILIAR',
    'JUBILADO',
    'ASPIRANTE',
    'PENSIONADO',
    'SOBREVIVIENTE'
  ].map((v) => v.toUpperCase())
);

const TURNO_VALUES = new Set(['DIURNO', 'NOCTURNO', 'ROTATIVO']);
const STATUS_VALUES = new Set(['ACTIVO', 'INACTIVO']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function asString(value: unknown) {
  return (value ?? '').toString().trim();
}

export function isBlank(value: unknown) {
  return asString(value).length === 0;
}

function normalizeHeader(header: unknown) {
  return asString(header).toUpperCase();
}

export function buildHeaderMap(headers: unknown[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const map: HeaderMap = {};
  const foundByNormalized: HeaderMap = {};

  headers.forEach((header, index) => {
    const normalized = normalizedHeaders[index];
    if (!normalized) return;
    const realHeader = asString(header);
    if (!foundByNormalized[normalized]) foundByNormalized[normalized] = realHeader;
  });

  const expected = [...TEMPLATE_HEADERS];
  expected.forEach((canonical) => {
    const aliases = HEADER_ALIASES[canonical] ?? [canonical];
    const foundAlias = aliases.find((alias) => Boolean(foundByNormalized[alias]));
    if (foundAlias) {
      map[canonical] = foundByNormalized[foundAlias];
    }
  });

  const missing = expected.filter((h) => !map[h]);
  const acceptedHeaders = new Set(
    expected.flatMap((h) => HEADER_ALIASES[h] ?? [h])
  );
  const extra = normalizedHeaders.filter((h) => h && !acceptedHeaders.has(h));

  const comparable = normalizedHeaders.slice(0, expected.length);
  const orderValid =
    comparable.length >= expected.length &&
    expected.every((h, i) => {
      const aliases = HEADER_ALIASES[h] ?? [h];
      return aliases.includes(comparable[i]);
    });

  return {
    map,
    normalizedHeaders,
    missing,
    extra,
    orderValid
  };
}

export function getCell(row: Record<string, unknown>, headerMap: HeaderMap, normalizedHeader: string) {
  const realHeader = headerMap[normalizedHeader];
  if (!realHeader) return '';
  return row[realHeader];
}

export function parseExcelDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const serial = value;
    const millis = Math.round((serial - 25569) * 86400 * 1000);
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const raw = asString(value);
  if (!raw) return null;

  const normalized = raw.replace(/\./g, '/').replace(/-/g, '/');
  const parts = normalized.split('/').map((p) => p.trim());

  if (parts.length === 3 && parts[0].length === 4) {
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    return makeDate(year, month, day);
  }

  if (parts.length === 3) {
    const day = Number(parts[0]);
    const month = Number(parts[1]);
    const year = Number(parts[2]);
    return makeDate(year, month, day);
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
}

function makeDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function normalizeCedula(value: unknown) {
  const raw = asString(value);
  if (!raw) {
    return { raw, normalized: '', isValid: false, reason: 'es obligatorio' };
  }

  if (raw.length > 15) {
    return { raw, normalized: raw.toUpperCase(), isValid: false, reason: 'excede máximo de 15 caracteres' };
  }

  if (/[.,]/.test(raw)) {
    return { raw, normalized: raw.toUpperCase(), isValid: false, reason: 'no puede contener puntos ni comas' };
  }

  const upper = raw.toUpperCase();

  if (/^[VE]\s*\d{6,8}$/.test(upper) || /^[VE]-?\d{6,8}$/.test(upper)) {
    const normalizedDigits = upper.replace(/\s+/g, '').replace('-', '').slice(1);
    const prefix = upper[0];
    return { raw, normalized: `${prefix}-${normalizedDigits}`, isValid: true };
  }

  if (/^\d{6,8}$/.test(upper)) {
    return { raw, normalized: upper, isValid: true };
  }

  return {
    raw,
    normalized: upper,
    isValid: false,
    reason: 'formato inválido. Use V-12345678, E-12345678 o 12345678'
  };
}

export function normalizePhone(value: unknown) {
  const raw = asString(value);
  if (!raw) return { raw, normalized: '', isValid: false, reason: 'es obligatorio' };
  if (raw.length > 15) return { raw, normalized: raw, isValid: false, reason: 'excede máximo de 15 caracteres' };
  if (/[A-Za-z]/.test(raw)) {
    return { raw, normalized: raw, isValid: false, reason: 'no puede contener letras' };
  }
  if (!/^[\d\s+()\-]+$/.test(raw)) {
    return { raw, normalized: raw, isValid: false, reason: 'contiene caracteres no permitidos' };
  }

  const compact = raw.replace(/[\s()\-]/g, '');
  const withoutPlus = compact.replace(/^\+/, '');
  if (!/^\d+$/.test(withoutPlus)) {
    return { raw, normalized: raw, isValid: false, reason: 'formato inválido' };
  }

  if (withoutPlus.length < 7 || withoutPlus.length > 15) {
    return { raw, normalized: raw, isValid: false, reason: 'longitud inválida' };
  }

  return { raw, normalized: raw, isValid: true };
}

function requireField(
  errors: FieldError[],
  field: string,
  value: unknown,
  options?: { max?: number; mustContainLetter?: boolean }
) {
  const str = asString(value);
  if (!str) {
    errors.push({ field, message: 'es obligatorio' });
    return null;
  }

  if (options?.max && str.length > options.max) {
    errors.push({ field, message: `excede máximo de ${options.max} caracteres` });
  }

  if (options?.mustContainLetter) {
    const hasLetter = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(str);
    if (!hasLetter) {
      errors.push({ field, message: 'debe contener al menos una letra' });
    }
  }

  return str;
}

export function validateRow(row: Record<string, unknown>, headerMap: HeaderMap, rowIndex: number) {
  const errors: FieldError[] = [];

  const cedulaRaw = getCell(row, headerMap, 'CEDULA');
  const cedulaNorm = normalizeCedula(cedulaRaw);
  if (!cedulaNorm.isValid) errors.push({ field: 'CEDULA', message: cedulaNorm.reason ?? 'inválida' });

  const nombre = requireField(errors, 'NOMBRE', getCell(row, headerMap, 'NOMBRE'), { max: 50, mustContainLetter: true });
  if (nombre && /^\d+$/.test(nombre)) errors.push({ field: 'NOMBRE', message: 'no puede ser solo números' });

  requireField(errors, 'APELLIDO', getCell(row, headerMap, 'APELLIDO'), { max: 50, mustContainLetter: true });

  const fechaNacimientoValue = getCell(row, headerMap, 'FECHA_NACIMIENTO');
  if (isBlank(fechaNacimientoValue)) {
    errors.push({ field: 'FECHA_NACIMIENTO', message: 'es obligatorio' });
  } else if (!parseExcelDate(fechaNacimientoValue)) {
    errors.push({ field: 'FECHA_NACIMIENTO', message: 'fecha inválida' });
  }

  const sexo = requireField(errors, 'SEXO', getCell(row, headerMap, 'SEXO'));
  if (sexo && !['M', 'F'].includes(sexo.toUpperCase())) {
    errors.push({ field: 'SEXO', message: 'solo permite M o F' });
  }

  requireField(errors, 'DIRECCION_HABITACION', getCell(row, headerMap, 'DIRECCION_HABITACION'), { max: 255 });

  const tHab = normalizePhone(getCell(row, headerMap, 'TELF_HABITACION'));
  if (!tHab.isValid) errors.push({ field: 'TELF_HABITACION', message: tHab.reason ?? 'inválido' });

  const tOf = normalizePhone(getCell(row, headerMap, 'TELF_OFICINA'));
  if (!tOf.isValid) errors.push({ field: 'TELF_OFICINA', message: tOf.reason ?? 'inválido' });

  const tMov = normalizePhone(getCell(row, headerMap, 'TELF_MOVIL'));
  if (!tMov.isValid) errors.push({ field: 'TELF_MOVIL', message: tMov.reason ?? 'inválido' });

  const email = requireField(errors, 'EMAIL', getCell(row, headerMap, 'EMAIL'), { max: 255 });
  if (email) {
    if (/\s/.test(email)) errors.push({ field: 'EMAIL', message: 'no debe contener espacios' });
    if (!EMAIL_REGEX.test(email)) errors.push({ field: 'EMAIL', message: 'formato inválido' });
  }

  const fechaIngreso = getCell(row, headerMap, 'FECHA_INGRESO_EMPRESA');
  if (!isBlank(fechaIngreso) && !parseExcelDate(fechaIngreso)) {
    errors.push({ field: 'FECHA_INGRESO_EMPRESA', message: 'fecha inválida' });
  }

  requireField(errors, 'CARGO_ACTUAL', getCell(row, headerMap, 'CARGO_ACTUAL'), { max: 100 });
  requireField(errors, 'ANTIGUEDAD_CARGO', getCell(row, headerMap, 'ANTIGUEDAD_CARGO'), { max: 10 });

  const ficha = asString(getCell(row, headerMap, 'FICHA_TRABAJADOR'));
  if (ficha && ficha.length > 10) {
    errors.push({ field: 'FICHA_TRABAJADOR', message: 'excede máximo de 10 caracteres' });
  }

  const tipoPaciente = asString(getCell(row, headerMap, 'TIPO_PACIENTE'));
  if (tipoPaciente && !TIPO_PACIENTE_VALUES.has(tipoPaciente.toUpperCase())) {
    errors.push({ field: 'TIPO_PACIENTE', message: 'valor no permitido' });
  }

  const turno = requireField(errors, 'TURNO_TRABAJO', getCell(row, headerMap, 'TURNO_TRABAJO'));
  if (turno && !TURNO_VALUES.has(turno.toUpperCase())) {
    errors.push({ field: 'TURNO_TRABAJO', message: 'debe ser Diurno, Nocturno o Rotativo' });
  }

  requireField(errors, 'NOMBRE_EMPRESA', getCell(row, headerMap, 'NOMBRE_EMPRESA'), { max: 100 });
  requireField(errors, 'NOMBRE_DEPENDENCIA', getCell(row, headerMap, 'NOMBRE_DEPENDENCIA'), { max: 50 });
  requireField(errors, 'PAIS_NACIMIENTO', getCell(row, headerMap, 'PAIS_NACIMIENTO'), { max: 50 });
  requireField(errors, 'CIUDAD_NACIMIENTO', getCell(row, headerMap, 'CIUDAD_NACIMIENTO'), { max: 50 });

  const status = requireField(errors, 'STATUS', getCell(row, headerMap, 'STATUS'));
  if (status && !STATUS_VALUES.has(status.toUpperCase())) {
    errors.push({ field: 'STATUS', message: 'debe ser Activo o Inactivo' });
  }

  const normalizedRow = {
    ...row,
    CEDULA_NORMALIZADA: cedulaNorm.normalized,
    FECHA_NACIMIENTO_NORMALIZADA: parseExcelDate(fechaNacimientoValue)?.toISOString().slice(0, 10) ?? '',
    FECHA_INGRESO_EMPRESA_NORMALIZADA: parseExcelDate(fechaIngreso)?.toISOString().slice(0, 10) ?? ''
  };

  return {
    rowIndex,
    errors,
    normalizedRow,
    valid: errors.length === 0
  };
}
