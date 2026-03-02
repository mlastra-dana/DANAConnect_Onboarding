import { ValidationStatus } from '../../app/types';

const labelMap: Record<ValidationStatus, string> = {
  pending: 'Pendiente',
  validating: 'Validando',
  valid: 'Válido',
  error: 'Error'
};

const colorMap: Record<ValidationStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  validating: 'border border-orange-200 bg-orange-50 text-perfilabOrangeDark',
  valid: 'border border-orange-200 bg-orange-50 text-perfilabOrange',
  error: 'bg-red-100 text-red-700'
};

export function StatusBadge({ status }: { status: ValidationStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colorMap[status]}`}>{labelMap[status]}</span>;
}
