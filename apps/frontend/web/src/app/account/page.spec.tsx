import Page from './page';
import { AccountScreen } from '../../components/account-screen';

describe('demo login runtime setting', () => {
  const original = process.env.DEMO_LOGIN_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.DEMO_LOGIN_ENABLED;
    else process.env.DEMO_LOGIN_ENABLED = original;
  });
  it.each([undefined, 'false', 'TRUE', '1', 'true'])(
    'only enables an explicit true value (%s)',
    (value) => {
      if (value === undefined) delete process.env.DEMO_LOGIN_ENABLED;
      else process.env.DEMO_LOGIN_ENABLED = value;
      const page = Page();
      expect(page.type).toBe(AccountScreen);
      expect(page.props.demoLoginEnabled).toBe(value === 'true');
    },
  );
});
