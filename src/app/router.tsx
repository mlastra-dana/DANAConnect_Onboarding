import { Navigate, Route, Routes } from 'react-router-dom';
import { OnboardingFlow } from './OnboardingFlow';
import { NotFoundPage } from '../pages/NotFoundPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/onboarding/demo-001" replace />} />
      <Route path="/onboarding" element={<OnboardingFlow />} />
      <Route path="/onboarding/:companyId" element={<OnboardingFlow />} />
      <Route path="/onboarding/:companyId/:step" element={<OnboardingFlow />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
