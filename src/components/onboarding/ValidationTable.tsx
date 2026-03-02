import { ExcelValidationState } from '../../app/types';
import { Card } from '../ui/Card';

export function ValidationTable({ excel }: { excel: ExcelValidationState }) {
  if (excel.totalRows === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Suba un archivo para ver la previsualización y los errores por fila.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <h4 className="mb-3 text-base font-semibold text-slate-900">Primeras 20 filas</h4>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                {excel.headers.map((header) => (
                  <th key={header} className="px-2 py-2 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {excel.previewRows.map((row, idx) => {
                const rowNumber = idx + 2;
                const hasIssue = excel.issues.some((issue) => issue.rowNumber === rowNumber);
                return (
                  <tr key={`preview-${idx}`} className={hasIssue ? 'bg-red-50' : 'border-b border-slate-100'}>
                    {excel.headers.map((header) => (
                      <td key={`${idx}-${header}`} className="px-2 py-2 text-slate-700">
                        {String(row[header] ?? '')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h4 className="mb-3 text-base font-semibold text-slate-900">Errores detectados</h4>
        {excel.issues.length === 0 ? (
          <p className="text-sm text-perfilabOrange">No se detectaron errores.</p>
        ) : (
          <ul className="max-h-64 space-y-3 overflow-auto text-sm text-red-700">
            {excel.issues.slice(0, 100).map((issue) => (
              <li key={issue.rowNumber} className="rounded-lg border border-red-100 bg-red-50/60 p-2.5">
                <p className="font-semibold">Error en Fila {issue.rowNumber}</p>
                {issue.fieldErrors && issue.fieldErrors.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {issue.fieldErrors.map((error, idx) => (
                      <li key={`${issue.rowNumber}-${error.field}-${idx}`}>
                        <span className="font-medium">[{error.field}]</span> {error.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1">{issue.reasons.join(' | ')}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
