import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';

export function PlaceholderPage({
  title,
  subtitle,
  body,
}: {
  title: string;
  subtitle: string;
  body: string;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <p className="text-sm text-ink-soft leading-relaxed">{body}</p>
      </Card>
    </>
  );
}
