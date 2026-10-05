import { expect, test } from '@playwright/test';

test('uses real Nest cookies to register, restore the account, and logout', async ({
  page,
}) => {
  const username = `web_${Date.now().toString(36)}`;
  const email = `${username}@example.com`;
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Account navigation' })
    .getByRole('button', { name: 'Create account' })
    .click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Strong123!');
  await page
    .getByRole('form', { name: 'Create account', exact: true })
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: `Hey, ${username}!` }),
  ).toBeVisible();
  const cookies = await page.context().cookies();
  expect(
    cookies.find((cookie) => cookie.name === 'Authentication')?.httpOnly,
  ).toBe(true);
  await page.reload();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === 'Authentication',
    ),
  ).toBe(false);
});
