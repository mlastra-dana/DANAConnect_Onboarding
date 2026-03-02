import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <Card className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Página no encontrada</h1>
        <p className="mt-2 text-slate-600">La ruta solicitada no existe o el enlace es inválido.</p>
        <div className="mt-4">
          <Link to="/onboarding/demo-001">
            <Button>Ir al onboarding demo</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
