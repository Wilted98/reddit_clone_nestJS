import { expect, test } from '@playwright/test';

test('publishes, comments, votes and restores real vote state with the Nest cookie', async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const username = `talk_${suffix}`;
  const email = `${username}@example.com`;
  const slug = `talk_${suffix}`;
  await page.goto('/account');
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
  const communityResponse = await page.request.post(
    'http://localhost:3001/graphql',
    {
      data: {
        query:
          'mutation($input: CreateCommunityInput!) { createCommunity(createCommunityInput: $input) { id } }',
        variables: { input: { name: `Web discussion ${suffix}`, slug } },
      },
    },
  );
  expect(communityResponse.ok()).toBe(true);
  expect((await communityResponse.json()).errors).toBeUndefined();
  let postId: string | undefined;
  let commentId: string | undefined;
  try {
    await page.goto(`/submit?${new URLSearchParams({ community: slug })}`);
    await page
      .getByLabel('Title', { exact: true })
      .fill('A real web discussion');
    await page
      .getByLabel('Your post')
      .fill('Checking the complete discussion workflow.');
    await page.getByRole('button', { name: 'Publish post' }).click();
    await expect(page).toHaveURL(/\/posts\//);
    postId = new URL(page.url()).pathname.split('/')[2];
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'A real web discussion',
    );
    await page
      .getByLabel('Add a comment')
      .fill('A comment from the real web client.');
    const writeResponse = page.waitForResponse(
      (response) =>
        response.url() === 'http://localhost:3001/graphql' &&
        response.request().postDataJSON()?.operationName === 'PublishComment',
    );
    await page
      .getByRole('button', { name: 'Post comment', exact: true })
      .click();
    const written = await (await writeResponse).json();
    expect(written.errors).toBeUndefined();
    commentId = written.data.createComment.id;
    const comment = page.getByTestId(`comment-${commentId}`);
    await expect(comment).toBeVisible();
    const postVotes = page.getByRole('group', { name: 'Post voting' });
    await postVotes
      .getByRole('button', { name: 'Upvote post', exact: true })
      .click();
    await expect(postVotes.getByLabel('1 score')).toBeVisible();
    await comment
      .getByRole('button', { name: 'Upvote comment', exact: true })
      .click();
    await expect(comment.getByLabel('1 score')).toBeVisible();
    await page.reload();
    await expect(
      postVotes.getByRole('button', { name: 'Upvote post' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(postVotes.getByLabel('1 score')).toBeVisible();
    await expect(
      comment.getByRole('button', { name: 'Upvote comment' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(email, { exact: true })).toHaveCount(0);
    await page.goto('/?sort=NEW');
    await expect(
      page
        .getByRole('region', { name: 'Subscribed communities' })
        .getByRole('link', { name: `r/${slug}`, exact: true }),
    ).toBeVisible();
    const feedPost = page.getByTestId(`post-${postId}`);
    await expect(
      feedPost.getByRole('link', { name: `r/${slug}`, exact: true }),
    ).toBeVisible();
    await expect(
      feedPost.getByRole('button', { name: 'Upvote post', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await feedPost
      .getByRole('button', { name: 'Downvote post', exact: true })
      .click();
    await expect(feedPost.getByLabel('-1 score')).toBeVisible();
    await expect(page).toHaveURL('/?sort=NEW');
    await feedPost
      .getByRole('button', { name: 'Upvote post', exact: true })
      .click();
    await expect(feedPost.getByLabel('1 score')).toBeVisible();
  } finally {
    for (const [operation, id] of [
      ['deleteComment', commentId],
      ['deletePost', postId],
    ]) {
      if (id) {
        const response = await page.request.post(
          'http://localhost:3001/graphql',
          {
            data: {
              query: `mutation($id: String!) { ${operation}(id: $id) { id } }`,
              variables: { id },
            },
          },
        );
        expect((await response.json()).errors).toBeUndefined();
      }
    }
  }
});
