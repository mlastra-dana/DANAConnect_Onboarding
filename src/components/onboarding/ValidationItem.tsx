import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

export function ValidationItem({
  status,
  label,
  detail
}: {
  status: 'pass' | 'fail' | 'warn';
  label: string;
  detail?: string;
}) {
  if (status === 'pass') {
    return (
      <li className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-perfilabOrange" />
        <div>
          <p className="text-perfilabOrange">{label}</p>
          {detail ? <p className="text-perfilabGray">({detail})</p> : null}
        </div>
      </li>
    );
  }

  if (status === 'warn') {
    return (
      <li className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-perfilabOrangeDark" />
        <div>
          <p className="text-perfilabDark">{label}</p>
          {detail ? <p className="text-perfilabGray">({detail})</p> : null}
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-2">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
      <div>
        <p className="text-red-600">{label}</p>
        {detail ? <p className="text-perfilabGray">({detail})</p> : null}
      </div>
    </li>
  );
}
