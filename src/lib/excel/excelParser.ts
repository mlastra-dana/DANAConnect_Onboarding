import * as XLSX from 'xlsx';
import { ExcelValidationState } from '../../app/types';
import { TEMPLATE_HEADERS, asString, buildHeaderMap, validateRow } from '../validators/excelValidators';

type ProgressFn = (processed: number, total: number) => void;

export async function parseExcelWithValidation(
  file: File,
  onProgress?: ProgressFn
): Promise<ExcelValidationState> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' });

  const headerRow = (matrix[0] ?? []) as unknown[];
  const dataRows = matrix.slice(1) as unknown[][];

  const headers = headerRow.map((h) => asString(h));
  const headerInfo = buildHeaderMap(headerRow);

  const issues: ExcelValidationState['issues'] = [];
  const previewRows: Record<string, unknown>[] = [];

  if (headerInfo.missing.length > 0) {
    issues.push({
      rowNumber: 1,
      reasons: [`Faltan columnas requeridas: ${headerInfo.missing.join(', ')}`],
      fieldErrors: headerInfo.missing.map((field) => ({ field, message: 'columna requerida no encontrada' })),
      rowData: {}
    });
  }

  if (!headerInfo.orderValid) {
    issues.push({
      rowNumber: 1,
      reasons: ['No modifique el orden de las columnas del template.'],
      fieldErrors: [{ field: 'HEADERS', message: 'orden de columnas inválido' }],
      rowData: {}
    });
  }

  const nonEmptyRows = dataRows
    .map((rowArray, index) => ({ rowArray, rowNumber: index + 2 }))
    .filter(({ rowArray }) => rowArray.some((cell) => asString(cell).length > 0));

  let processedRows = 0;
  let validRows = 0;
  const totalRows = nonEmptyRows.length;

  for (let index = 0; index < nonEmptyRows.length; index += 1) {
    const { rowArray, rowNumber } = nonEmptyRows[index];
    const rowObject: Record<string, unknown> = {};

    headers.forEach((header, colIndex) => {
      rowObject[header] = rowArray[colIndex] ?? '';
    });

    const validation = validateRow(rowObject, headerInfo.map, rowNumber);

    if (previewRows.length < 20) {
      previewRows.push(rowObject);
    }

    if (validation.valid) {
      validRows += 1;
    } else {
      const fieldErrors = validation.errors;
      const reasons = fieldErrors.map((err) => `[${err.field}] ${err.message}`);

      issues.push({
        rowNumber,
        reasons,
        fieldErrors,
        rowData: rowObject
      });
    }

    processedRows += 1;
    onProgress?.(processedRows, totalRows);

    if (index % 50 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const invalidRows = totalRows - validRows;

  return {
    status: invalidRows === 0 && totalRows > 0 && issues.length === 0 ? 'valid' : 'error',
    totalRows,
    processedRows,
    validRows,
    invalidRows,
    headers: headers.length > 0 ? headers : [...TEMPLATE_HEADERS],
    previewRows,
    issues
  };
}

export function buildInvalidRowsCsv(issues: ExcelValidationState['issues']) {
  if (!issues.length) return '';

  const columns = Object.keys(issues[0].rowData);
  const header = ['fila', 'motivo', ...columns].join(',');

  const lines = issues.map((issue) => {
    const cells = columns.map((col) => sanitizeCsvCell(String(issue.rowData[col] ?? '')));
    return [issue.rowNumber, sanitizeCsvCell(issue.reasons.join(' | ')), ...cells].join(',');
  });

  return [header, ...lines].join('\n');
}

function sanitizeCsvCell(value: string) {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}
