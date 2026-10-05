import { FeedScreen } from '../components/feed-screen';
import { parseFeedFilters, SearchParams } from '../lib/feed';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <FeedScreen filters={parseFeedFilters(await searchParams)} />;
}
