import { DiscussionScreen } from '../../../components/discussion-screen';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DiscussionScreen key={id} id={id} />;
}
