import { LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MouseEvent } from 'react';
import { Button } from '../ui/Button';

export function DanaConnectHeader({
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
  if (!showExit) {
    return (
      <header className="sticky top-0 z-40 border-b border-borderLight bg-white">
        <div className="mx-auto flex h-[68px] w-full max-w-7xl items-center px-5 md:px-8">
          <Link to={`/onboarding/${companyId}`} className="shrink-0" aria-label="Ir a inicio DanaConnect" onClick={onHomeClick}>
            <img src={logoUrl || '/logo-danaconnect-horizontal.png'} alt="Logo DanaConnect" className="h-9 w-auto md:h-10" />
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-borderLight bg-white">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-6">
        <Link to={`/onboarding/${companyId}`} className="flex items-center" aria-label="Ir a inicio DanaConnect" onClick={onHomeClick}>
          <img src={logoUrl || '/logo-danaconnect-horizontal.png'} alt="Logo DanaConnect" className="h-9 w-auto" />
        </Link>

        <div className="flex items-center">
          <Button type="button" variant="secondary" onClick={onExit} className="h-10 gap-2" aria-label="Salir del onboarding">
            <LogOut className="h-4 w-4" />
            <span>Salir</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
