import { FeedScreen } from '../../../components/feed-screen';
import { parseFeedFilters, SearchParams } from '../../../lib/feed';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  return (
    <FeedScreen
      key={slug}
      slug={slug}
      filters={parseFeedFilters(await searchParams)}
    />
  );
}
