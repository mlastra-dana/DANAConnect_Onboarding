import { LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MouseEvent } from 'react';
import { Button } from '../ui/Button';

export function PerfilabHeader({
  tenantName,
  logoUrl,
  companyId,
  onHomeClick,
  onExit,
  showExit = true
}: {
  tenantName: string;
  logoUrl?: string;
  companyId: string;
  onHomeClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onExit?: () => void;
  showExit?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-borderLight bg-white">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-6">
        <Link to={`/onboarding/${companyId}`} className="flex items-center gap-3" aria-label="Ir a inicio DanaConnect" onClick={onHomeClick}>
          <img src={logoUrl || '/logo-danaconnect-horizontal.png'} alt="Logo DanaConnect" className="h-9 w-auto" />
          <span className="hidden text-sm font-semibold text-dark xl:inline">{tenantName}</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Navegación principal">
          <Link to={`/onboarding/${companyId}`} className="text-sm font-medium text-grayText transition-colors hover:text-dark">
            Inicio
          </Link>
          <Link to={`/onboarding/${companyId}/documents`} className="text-sm font-medium text-grayText transition-colors hover:text-dark">
            Documentos
          </Link>
          <Link to={`/onboarding/${companyId}/review`} className="text-sm font-medium text-grayText transition-colors hover:text-dark">
            Revisión
          </Link>
        </nav>

        <div className="flex items-center">
          {showExit ? (
            <Button type="button" variant="secondary" onClick={onExit} className="h-10 gap-2" aria-label="Salir del onboarding">
              <LogOut className="h-4 w-4" />
              <span>Salir</span>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
