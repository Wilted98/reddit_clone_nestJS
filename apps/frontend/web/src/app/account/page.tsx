import { AccountScreen } from '../../components/account-screen';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <AccountScreen
      demoLoginEnabled={process.env.DEMO_LOGIN_ENABLED === 'true'}
    />
  );
}
