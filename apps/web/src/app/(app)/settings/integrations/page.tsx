import { ComingSoon } from '@/components/coming-soon';
export const metadata = { title: 'Integration Settings' };
export default function Page() {
  return (
    <ComingSoon title="Integration Settings" phase={2} description="Mailbox and API credentials."
      points={['OAuth tokens will be stored encrypted on the server (Supabase Vault) and never sent to the browser.', 'Disconnect and reauthorize controls, sync intervals and data retention per mailbox.']} />
  );
}
