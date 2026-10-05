import { expect, test } from '@playwright/test';

test('reads the real social feed and directory without modifying database records', async ({
  page,
  request,
}) => {
  const response = await request.post('http://localhost:3001/graphql', {
    data: {
      query:
        'query { feed(sort: NEW, limit: 20) { items { id title } } communities(limit: 20) { items { slug name } } }',
    },
  });
  expect(response.ok()).toBe(true);
  const result = await response.json();
  expect(result.errors).toBeUndefined();
  await page.goto('/?sort=NEW');
  if (result.data.feed.items.length) {
    const first = result.data.feed.items[0];
    await expect(page.getByTestId(`post-${first.id}`)).toContainText(
      first.title,
    );
  } else
    await expect(
      page.getByRole('heading', { name: 'No posts yet' }),
    ).toBeVisible();
  await page.getByRole('link', { name: 'Communities', exact: true }).click();
  const directory = page.getByRole('region', {
    name: 'Communities',
    exact: true,
  });
  if (result.data.communities.items.length) {
    const first = result.data.communities.items[0];
    await directory
      .getByRole('link', { name: new RegExp(`r/${first.slug}\\b`) })
      .click();
    await expect(page).toHaveURL(`/r/${first.slug}`);
    await expect(
      page.getByRole('heading', { name: first.name, exact: true, level: 1 }),
    ).toBeVisible();
  } else
    await expect(
      directory.getByRole('heading', { name: 'No communities yet' }),
    ).toBeVisible();
});
