import { LockKeyhole, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MouseEvent } from 'react';
import { Button } from '../ui/Button';

const DEFAULT_LOGO = '/Mercantilbanco.svg';

export function DanaConnectHeader({
  tenantName,
  logoUrl,
  companyId,
  onHomeClick,
  onExit,
  showExit = true,
  language = 'es'
}: {
  tenantName: string;
  logoUrl?: string;
  companyId: string;
  onHomeClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onExit?: () => void;
  showExit?: boolean;
  language?: 'es' | 'en';
}) {
  const homeLabel = language === 'en' ? `Go to ${tenantName} home` : `Ir a inicio ${tenantName}`;
  const exitLabel = language === 'en' ? 'Exit onboarding' : 'Salir del onboarding';

  return (
    <header className="sticky top-0 z-40 border-b border-borderLight bg-white">
      <div className="h-1 bg-primary" />
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between gap-4 px-5 md:px-8">
        <Link to={`/onboarding/${companyId}`} className="flex shrink-0 items-center" aria-label={homeLabel} onClick={onHomeClick}>
          <img src={logoUrl || DEFAULT_LOGO} alt={`Logo ${tenantName}`} className="h-16 w-[110px] object-contain object-left" />
        </Link>

        <div className="flex items-center gap-6">
          <span className="hidden items-center gap-2 text-sm text-grayText sm:inline-flex"><LockKeyhole className="h-4 w-4 text-primary" />{language === 'en' ? 'Digital onboarding' : 'Onboarding digital'}</span>
          {showExit ? <Button type="button" variant="ghost" onClick={onExit} className="h-10 gap-2" aria-label={exitLabel} title={exitLabel}>
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{language === 'en' ? 'Exit' : 'Salir'}</span>
          </Button> : <span className="border-l border-borderLight pl-4 text-xs font-medium text-grayText">Demo</span>}
        </div>
      </div>
    </header>
  );
}
