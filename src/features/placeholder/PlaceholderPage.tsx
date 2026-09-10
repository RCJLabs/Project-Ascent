import { EmptyState } from '@/ui/EmptyState';
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
      <EmptyState>{body}</EmptyState>
    </>
  );
}
