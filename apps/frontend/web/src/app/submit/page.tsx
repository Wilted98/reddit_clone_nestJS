import { ComposerScreen } from '../../components/composer-screen';
import type { SearchParams } from '../../lib/feed';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { community } = await searchParams;
  return (
    <ComposerScreen
      community={typeof community === 'string' ? community : ''}
    />
  );
}
