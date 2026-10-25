import { ComingSoon } from '@/components/coming-soon';
export const metadata = { title: 'Analytics' };
export default function Page() {
  return <ComingSoon title="Analytics" phase={5} description="Trends across sources, vendors and technologies." points={['The Dashboard already shows live counts by technology, state, visa, source and date.']} />;
}
