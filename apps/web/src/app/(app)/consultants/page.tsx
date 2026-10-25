import { ComingSoon } from '@/components/coming-soon';
export const metadata = { title: 'Consultant Bench' };
export default function Page() {
  return (
    <ComingSoon title="Consultant Bench" phase={5} description="Consultant profiles and evidence-based job matching."
      points={[
        'The database tables and access policies already exist; viewers cannot read consultant data.',
        'Profiles, resume uploads with validation, and ranked matches with explanations ship in Phase 5.',
      ]} />
  );
}
