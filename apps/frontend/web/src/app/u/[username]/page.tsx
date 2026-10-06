import { ProfileScreen } from '../../../components/profile-screen';

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { username } = await params;
  const { tab } = await searchParams;
  return (
    <ProfileScreen
      key={username}
      username={username}
      tab={tab === 'comments' ? 'comments' : 'posts'}
    />
  );
}
