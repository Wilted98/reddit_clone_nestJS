import { expect, Page, test } from '@playwright/test';

const account = {
  __typename: 'Account',
  id: 'one',
  username: 'roorin_user',
  email: 'private@example.com',
  avatarUrl: null,
  bio: null,
};

async function mockAuth(
  page: Page,
  options: {
    restored?: boolean;
    loginStatus?: number;
    loginFailures?: number;
    logoutFailure?: boolean;
  } = {},
) {
  let signedIn = options.restored ?? false;
  let loginCalls = 0;
  const operations: string[] = [];
  await page.route('http://localhost:3001/graphql', async (route) => {
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4200',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers });
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          myCommunities: { items: [], hasMore: false, nextCursor: null },
        },
      }),
    });
  });
  await page.route('http://localhost:3000/graphql', async (route) => {
    const request = route.request();
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4200',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers });
    const { operationName } = request.postDataJSON();
    operations.push(operationName);
    let data;
    let status = 0;
    if (operationName === 'Session') {
      if (signedIn) data = { me: account };
      else status = 401;
    }
    if (operationName === 'Register')
      data = {
        createUser: {
          __typename: 'Account',
          id: account.id,
          username: account.username,
        },
      };
    if (operationName === 'SignIn') {
      loginCalls++;
      status =
        options.loginStatus ??
        (loginCalls <= (options.loginFailures ?? 0) ? 429 : 0);
      if (!status) {
        signedIn = true;
        data = { login: account };
      }
    }
    if (operationName === 'SignOut') {
      if (options.logoutFailure) status = 500;
      else {
        signedIn = false;
        data = { logout: true };
      }
    }
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(
        status
          ? {
              errors: [
                {
                  message: 'Failure',
                  extensions: {
                    code:
                      status === 401
                        ? 'UNAUTHENTICATED'
                        : 'INTERNAL_SERVER_ERROR',
                    originalError: { statusCode: status, message: 'Failure' },
                  },
                },
              ],
            }
          : { data },
      ),
    });
  });
  return operations;
}

async function signIn(page: Page) {
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('Strong123!');
  await page
    .getByRole('form', { name: 'Sign in', exact: true })
    .getByRole('button', { name: 'Sign in', exact: true })
    .click();
}

test('signs in, restores on reload, and removes private account state on logout', async ({
  page,
}, testInfo) => {
  const operations = await mockAuth(page);
  await page.goto('/account');
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  const illustration = page.locator('.welcome-photo img');
  await expect(illustration).toHaveAttribute('src', /community-plaza\.png/);
  if (testInfo.project.name === 'desktop') {
    await expect(illustration).toBeVisible();
    await expect
      .poll(() =>
        illustration.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
  }
  await signIn(page);
  await expect(
    page.getByRole('heading', { name: `Hey, ${account.username}!` }),
  ).toBeVisible();
  await expect(page.getByText(account.email, { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: `Hey, ${account.username}!` }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  await expect(page.getByText(account.email, { exact: true })).toHaveCount(0);
  expect(operations).toContain('SignOut');
  await page.screenshot({
    path: testInfo.outputPath('login.png'),
    fullPage: true,
  });
});

test('keeps one account entry and switches auth modes beneath the form', async ({
  page,
}, testInfo) => {
  await mockAuth(page);
  await page.goto('/account');
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  const sidebar = page.locator('.sidebar');
  await expect(
    sidebar
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Sign in', exact: true }),
  ).toHaveCount(1);
  await expect(
    sidebar.getByRole('button', { name: /Sign in|Create account/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: 'Account navigation' }),
  ).toHaveCount(0);
  await page
    .locator('.auth-switch')
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(
    page.getByRole('form', { name: 'Create account', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Username')).toBeVisible();
  await page
    .locator('.auth-switch')
    .getByRole('button', { name: 'Sign in', exact: true })
    .click();
  await expect(
    page.getByRole('form', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('simplified-account-navigation.png'),
    fullPage: true,
  });
});

test('keeps drafts and shows validation, password visibility, and throttling errors', async ({
  page,
}) => {
  const operations = await mockAuth(page, { loginStatus: 429 });
  await page.goto('/account');
  const form = page.getByRole('form', { name: 'Sign in', exact: true });
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  expect(operations).not.toContain('SignIn');
  await page.getByLabel('Password', { exact: true }).fill('Strong123!');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'type',
    'text',
  );
  await page.getByRole('button', { name: 'Hide password' }).click();
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Too many attempts');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(
    account.email,
  );
});

test('does not register twice when automatic login is throttled', async ({
  page,
}) => {
  const operations = await mockAuth(page, { loginFailures: 1 });
  await page.goto('/account');
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await page.getByLabel('Username').fill(account.username);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('Strong123!');
  const form = page.getByRole('form', { name: 'Create account', exact: true });
  await form
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Account created');
  await expect(form.getByRole('alert')).toContainText('Too many attempts');
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: `Hey, ${account.username}!` }),
  ).toBeVisible();
  expect(
    operations.filter((operation) => operation === 'Register'),
  ).toHaveLength(1);
});

test('retains account view if logout fails', async ({ page }) => {
  await mockAuth(page, { restored: true, logoutFailure: true });
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Something went wrong',
  );
  await expect(page.getByText(account.email, { exact: true })).toBeVisible();
});

test('fits the viewport and never embeds private account data in initial HTML', async ({
  page,
  request,
}, testInfo) => {
  await mockAuth(page);
  await page.goto('/account');
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const response = await request.get('/account');
  expect(await response.text()).not.toContain(account.email);
  if (testInfo.project.name === 'desktop') {
    const image = page.getByRole('img', {
      name: 'A lively neighborhood street, with buildings and people crossing',
    });
    await expect(image).toBeVisible();
    expect(
      await image.evaluate((node: HTMLImageElement) => node.naturalWidth),
    ).toBeGreaterThan(0);
  }
});

test('does not submit malformed registration input', async ({ page }) => {
  const operations = await mockAuth(page);
  await page.goto('/account');
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await page.getByLabel('Username').fill('with spaces');
  await page.getByLabel('Email', { exact: true }).fill('bad-email');
  await page.getByLabel('Password', { exact: true }).fill('weak');
  await page
    .getByRole('form', { name: 'Create account', exact: true })
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(
    page.getByText('Use letters, numbers, or underscores.'),
  ).toBeVisible();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  expect(operations).not.toContain('Register');
});

test('shows invalid credentials without discarding the draft', async ({
  page,
}) => {
  await mockAuth(page, { loginStatus: 401 });
  await page.goto('/account');
  await signIn(page);
  await expect(
    page.getByRole('form', { name: 'Sign in', exact: true }).getByRole('alert'),
  ).toContainText('Email or password is incorrect');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(
    account.email,
  );
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
    'Strong123!',
  );
});
