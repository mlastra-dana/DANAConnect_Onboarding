import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { ValidationStatus } from '../../app/types';

type BadgeStatus = 'valid' | 'error' | 'pending' | 'warning' | 'review' | 'na';

function normalizeStatus(status: ValidationStatus | BadgeStatus): BadgeStatus {
  if (status === 'valid') return 'valid';
  if (status === 'error') return 'error';
  if (status === 'warning') return 'warning';
  if (status === 'review') return 'review';
  if (status === 'na') return 'na';
  return 'pending';
}

const statusConfig: Record<BadgeStatus, { label: string; className: string; Icon: typeof CheckCircle }> = {
  valid: {
    label: 'Validado',
    className: 'bg-green-50 text-green-700 border border-green-200',
    Icon: CheckCircle
  },
  error: {
    label: 'Documento inválido',
    className: 'bg-red-50 text-red-700 border border-red-200',
    Icon: XCircle
  },
  pending: {
    label: 'Pendiente',
    className: 'bg-gray-50 text-gray-600 border border-gray-200',
    Icon: Clock
  },
  warning: {
    label: 'Advertencia',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
    Icon: AlertTriangle
  },
  review: {
    label: 'Revisión requerida',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
    Icon: Clock
  },
  na: {
    label: 'No aplica',
    className: 'bg-slate-100 text-slate-600 border border-slate-200',
    Icon: Clock
  }
};

export function StatusBadge({ status }: { status: ValidationStatus | BadgeStatus }) {
  const normalizedStatus = normalizeStatus(status);
  const config = statusConfig[normalizedStatus];
  const Icon = config.Icon;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${config.className}`}>
      <Icon className="h-3.5 w-3.5" />
      <span>{config.label}</span>
    </span>
  );
}
