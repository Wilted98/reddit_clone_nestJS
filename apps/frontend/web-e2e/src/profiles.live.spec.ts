import { expect, test } from '@playwright/test';

test('saves own profile through Nest and keeps public profile activity separate from account email', async ({
  page,
}, testInfo) => {
  const username = `profile_${Date.now().toString(36)}`;
  const email = `${username}@example.com`;
  await page.goto('/account');
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Create account', exact: true })
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
  await page.getByRole('button', { name: 'Edit profile' }).click();
  const form = page.getByRole('form', { name: 'Profile settings' });
  const bio = 'A profile saved by the real Roorin web client.';
  await form.getByLabel('Bio').fill(bio);
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toContainText('Profile saved.');
  await page.reload();
  await expect(page.locator('.account-details')).toContainText(bio);
  await page.getByRole('link', { name: 'View public profile' }).click();
  await expect(
    page.getByRole('heading', { name: `u/${username}` }),
  ).toBeVisible();
  await expect(page.getByText(bio)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No posts yet' }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Profile activity' })
    .getByRole('link', { name: 'Comments' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'No comments yet' }),
  ).toBeVisible();
  await expect(page.getByText(email)).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('live-profile.png'),
    fullPage: true,
  });
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto(`/u/${username}`);
  await expect(page.getByText(bio)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit profile' })).toHaveCount(0);
  await expect(page.getByText(email)).toHaveCount(0);
});
