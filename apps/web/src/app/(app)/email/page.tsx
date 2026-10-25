import { ComingSoon } from '@/components/coming-soon';
export const metadata = { title: 'Email Requirements' };
export default function Page() {
  return (
    <ComingSoon title="Email Requirements" phase={2} description="Requirements extracted from your Prohires, work and personal mailboxes."
      points={[
        'Connect Gmail / Google Workspace or Microsoft 365 using OAuth with read-only scopes.',
        'Choose labels, folders, senders and keywords to monitor; exclude senders.',
        'AI classification and extraction with strict schema validation; email content is treated as untrusted data.',
        'Original sender, subject, timestamp and message ID are preserved for every requirement.',
      ]} />
  );
}
