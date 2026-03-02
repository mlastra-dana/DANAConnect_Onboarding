import { ValidationStatus } from '../../app/types';

const labelMap: Record<ValidationStatus, string> = {
  pending: 'Pendiente',
  validating: 'Validando',
  valid: 'Válido',
  error: 'Error'
};

const colorMap: Record<ValidationStatus, string> = {
  pending: 'border border-borderLight bg-pendingSoft text-grayText',
  validating: 'border border-[#F5C7BB] bg-[#FFF2EE] text-primary',
  valid: 'border border-[#F5C7BB] bg-successSoft text-primary',
  error: 'border border-[#F9C9C3] bg-errorSoft text-[#B42318]'
};

export function StatusBadge({ status }: { status: ValidationStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colorMap[status]}`}>{labelMap[status]}</span>;
}
