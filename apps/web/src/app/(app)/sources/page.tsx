import { ComingSoon } from '@/components/coming-soon';
export const metadata = { title: 'Job Board Sources' };
export default function Page() {
  return (
    <ComingSoon title="Job Board Sources" phase={4} description="Connector framework for authorized job sources."
      points={[
        'LinkedIn, Indeed and Dice do not offer public read APIs. Their listings arrive through job-alert emails in your connected mailboxes, with links to the original posting.',
        'CareerBuilder and Monster: access must be confirmed with the current owner before a connector is enabled.',
        'Official API adapters planned: USAJOBS, Adzuna, Greenhouse and Lever public job boards.',
        'Each connector will show its auth status, last sync, errors, rate-limit handling and terms notes.',
      ]} />
  );
}
