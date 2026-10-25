import { ComingSoon } from '@/components/coming-soon';
export const metadata = { title: 'Alerts' };
export default function Page() {
  return <ComingSoon title="Alerts" phase={5} description="Notifications when new requirements match a saved search." points={['In-app and email notifications, hourly or daily digests.']} />;
}
