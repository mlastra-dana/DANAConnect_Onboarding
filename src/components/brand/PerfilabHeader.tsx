import { LogOut, Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MouseEvent } from 'react';

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
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between px-4 md:px-6">
        <Link to={`/onboarding/${companyId}`} className="flex items-center gap-3" aria-label="Ir a inicio Perfilab" onClick={onHomeClick}>
          <img src={logoUrl || '/perfilab-logo.svg'} alt="Logo Perfilab" className="h-11 w-auto" />
          <span className="hidden text-sm font-semibold tracking-wide text-slate-700 md:inline">{tenantName}</span>
        </Link>

        <nav className="hidden items-center gap-6 text-[13px] font-bold tracking-[0.08em] text-perfilabDark lg:flex" aria-label="Menú principal">
          <a href="#nosotros" className="hover:text-perfilabOrange">
            NOSOTROS
          </a>
          <span className="text-perfilabOrange">|</span>
          <a href="#servicios" className="hover:text-perfilabOrange">
            SERVICIOS
          </a>
          <span className="text-perfilabOrange">|</span>
          <a href="#blog" className="hover:text-perfilabOrange">
            BLOG
          </a>
          <span className="text-perfilabOrange">|</span>
          <a href="#contacto" className="hover:text-perfilabOrange">
            CONTACTO
          </a>
        </nav>

        <div className="flex items-center gap-2">
          {showExit ? (
            <button
              type="button"
              onClick={onExit}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              aria-label="Salir del onboarding"
            >
              <LogOut className="h-4 w-4" />
              <span>Salir</span>
            </button>
          ) : null}
          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 lg:hidden" aria-label="Abrir menú">
            <Menu className="h-5 w-5 text-slate-700" />
          </button>
        </div>
      </div>
    </header>
  );
}
