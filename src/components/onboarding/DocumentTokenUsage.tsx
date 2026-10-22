import { DocumentValidationResult } from '../../app/types';

export function DocumentTokenUsage({ usage, language = 'es' }: {
  usage?: DocumentValidationResult['tokenUsage'];
  language?: 'es' | 'en';
}) {
  const en = language === 'en';
  if (!usage || (!usage.complete && usage.measuredCallCount === 0)) {
    return <p className="text-xs text-grayText">{en ? 'Token usage unavailable' : 'Consumo de tokens no disponible'}</p>;
  }
  const format = (value: number) => value.toLocaleString(en ? 'en-US' : 'es-VE');
  return (
    <div className="space-y-1 border-t border-borderLight pt-2 text-xs text-grayText" title={usage.modelId || undefined}>
      <p className="font-medium text-dark">
        {usage.complete ? 'Tokens' : en ? 'Tokens (partial)' : 'Tokens (parcial)'}: {format(usage.totalTokens)}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span>{en ? 'Input' : 'Entrada'}: {format(usage.inputTokens)}</span>
        <span>{en ? 'Output' : 'Salida'}: {format(usage.outputTokens)}</span>
        <span>{en ? 'Calls' : 'Llamadas'}: {usage.callCount}</span>
      </div>
      <p>{en ? 'Latest validation' : 'Última validación'}</p>
    </div>
  );
}
