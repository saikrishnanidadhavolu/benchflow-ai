import { Card, CardBody } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';

export function ComingSoon({ title, phase, description, points }: { title: string; phase: number; description: string; points: string[] }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm font-medium text-slate-800">Planned for Phase {phase}. Nothing on this page is connected yet, so no data is shown.</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
