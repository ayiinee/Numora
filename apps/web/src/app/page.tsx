import { LandingPage } from '@/features/landing/landing-page';
import { LoginScreen } from '@/features/onboarding/screens';

export default function Home() {
  return <LoginScreen publicLanding={<LandingPage />} />;
}
