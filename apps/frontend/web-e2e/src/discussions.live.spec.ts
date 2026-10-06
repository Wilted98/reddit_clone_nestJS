import { expect, test } from '@playwright/test';

test('publishes, edits, votes and soft-deletes real content with the Nest cookie', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const suffix = Date.now().toString(36);
  const username = `talk_${suffix}`;
  const email = `${username}@example.com`;
  const slug = `talk_${suffix}`;
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
  await page.goto('/communities/new');
  await page
    .getByLabel('Name', { exact: true })
    .fill(`Web discussion ${suffix}`);
  await page.getByLabel('Slug', { exact: true }).fill(slug);
  await page
    .getByRole('button', { name: 'Create community', exact: true })
    .click();
  await expect(page).toHaveURL(`/r/${slug}`);
  await expect(
    page.getByRole('heading', {
      name: `Web discussion ${suffix}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.goto('/communities/joined');
  const ownedMembership = page
    .locator('.membership-row')
    .filter({ hasText: `r/${slug}` });
  await expect(
    ownedMembership.getByText('Owner', { exact: true }),
  ).toBeVisible();
  await expect(
    ownedMembership.getByRole('button', { name: /Leave/ }),
  ).toHaveCount(0);

  // An isolated second account exercises a real non-owner departure.
  const memberContext = await browser.newContext();
  try {
    const memberUsername = `member_${suffix}`;
    for (const [query, input] of [
      [
        'mutation($input: CreateUserInput!) { createUser(createUserInput: $input) { id } }',
        {
          username: memberUsername,
          email: `${memberUsername}@example.com`,
          password: 'Strong123!',
        },
      ],
      [
        'mutation($input: LoginInput!) { login(loginInput: $input) { id } }',
        { email: `${memberUsername}@example.com`, password: 'Strong123!' },
      ],
    ]) {
      const response = await memberContext.request.post(
        'http://localhost:3000/graphql',
        { data: { query, variables: { input } } },
      );
      expect((await response.json()).errors).toBeUndefined();
    }
    const membershipMutation =
      'mutation($slug: String!) { joinCommunity(slug: $slug) { id memberCount } }';
    const joinedResponse = await memberContext.request.post(
      'http://localhost:3001/graphql',
      { data: { query: membershipMutation, variables: { slug } } },
    );
    const joinedResult = await joinedResponse.json();
    expect(joinedResult.errors).toBeUndefined();
    expect(joinedResult.data.joinCommunity.memberCount).toBe(2);
    const memberPage = await memberContext.newPage();
    await memberPage.goto('http://localhost:4200/communities/joined');
    await memberPage
      .getByRole('button', { name: `Leave r/${slug}`, exact: true })
      .click();
    await memberPage
      .getByRole('button', { name: 'Confirm leave community' })
      .click();
    await expect(
      memberPage.getByRole('heading', { name: 'No joined communities' }),
    ).toBeVisible();
    await memberPage.reload();
    await expect(
      memberPage.getByRole('heading', { name: 'No joined communities' }),
    ).toBeVisible();
    const communityResponse = await page.request.post(
      'http://localhost:3001/graphql',
      {
        data: {
          query:
            'query($slug: String!) { community(slug: $slug) { memberCount } }',
          variables: { slug },
        },
      },
    );
    expect((await communityResponse.json()).data.community.memberCount).toBe(1);
  } finally {
    await memberContext.request.post('http://localhost:3001/graphql', {
      data: {
        query:
          'mutation($slug: String!) { leaveCommunity(slug: $slug) { id } }',
        variables: { slug },
      },
    });
    await memberContext.close();
  }
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
    const discussionPost = page.getByTestId(`post-${postId}`);
    await discussionPost
      .getByRole('button', { name: 'Post options', exact: true })
      .click();
    await discussionPost
      .getByRole('button', { name: 'Edit post', exact: true })
      .click();
    await discussionPost
      .getByLabel('Title', { exact: true })
      .fill('An edited real web discussion');
    await discussionPost.getByRole('button', { name: 'Save changes' }).click();
    await expect(discussionPost.getByRole('heading')).toHaveText(
      'An edited real web discussion',
    );
    await comment
      .getByRole('button', { name: 'Comment options', exact: true })
      .click();
    await comment
      .getByRole('button', { name: 'Edit comment', exact: true })
      .click();
    await comment
      .getByLabel('Comment', { exact: true })
      .fill('An edited real comment.');
    await comment.getByRole('button', { name: 'Save changes' }).click();
    await expect(comment.locator(':scope > .comment-body')).toHaveText(
      'An edited real comment.',
    );
    await page.reload();
    await expect(discussionPost.getByRole('heading')).toHaveText(
      'An edited real web discussion',
    );
    await expect(comment.locator(':scope > .comment-body')).toHaveText(
      'An edited real comment.',
    );
    await page.goto(`/u/${username}`);
    await discussionPost
      .getByRole('button', { name: 'Post options', exact: true })
      .click();
    await discussionPost
      .getByRole('button', { name: 'Edit post', exact: true })
      .click();
    await discussionPost
      .getByLabel('Title', { exact: true })
      .fill('A profile-edited real discussion');
    await discussionPost.getByRole('button', { name: 'Save changes' }).click();
    await expect(discussionPost.getByRole('heading')).toHaveText(
      'A profile-edited real discussion',
    );
    await page
      .getByRole('navigation', { name: 'Profile activity' })
      .getByRole('link', { name: 'Comments', exact: true })
      .click();
    const activityComment = page.getByTestId(`activity-comment-${commentId}`);
    await activityComment
      .getByRole('button', { name: 'Comment options', exact: true })
      .click();
    await activityComment
      .getByRole('button', { name: 'Edit comment', exact: true })
      .click();
    await activityComment
      .getByLabel('Comment', { exact: true })
      .fill('A profile-edited real comment.');
    await activityComment.getByRole('button', { name: 'Save changes' }).click();
    await expect(activityComment.locator(':scope > .comment-body')).toHaveText(
      'A profile-edited real comment.',
    );
    await activityComment
      .getByRole('button', { name: 'Comment options', exact: true })
      .click();
    await activityComment
      .getByRole('button', { name: 'Delete comment', exact: true })
      .click();
    await activityComment
      .getByRole('button', { name: 'Confirm delete comment', exact: true })
      .click();
    await expect(activityComment).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'No comments yet', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Profile activity' })
      .getByRole('link', { name: 'Posts', exact: true })
      .click();
    await expect(discussionPost.getByRole('heading')).toHaveText(
      'A profile-edited real discussion',
    );
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
    await feedPost
      .getByRole('link', {
        name: 'A profile-edited real discussion',
        exact: true,
      })
      .click();
    await expect(comment.locator(':scope > .comment-body')).toHaveText(
      '[deleted]',
    );
    await expect(
      discussionPost.getByRole('link', { name: '1 comments', exact: true }),
    ).toBeVisible();
    await discussionPost
      .getByRole('button', { name: 'Post options', exact: true })
      .click();
    await discussionPost
      .getByRole('button', { name: 'Delete post', exact: true })
      .click();
    await discussionPost
      .getByRole('button', { name: 'Confirm delete post', exact: true })
      .click();
    await expect(discussionPost.getByRole('heading', { level: 1 })).toHaveText(
      '[Deleted post]',
    );
    await page.reload();
    await expect(discussionPost.getByRole('heading', { level: 1 })).toHaveText(
      '[Deleted post]',
    );
    await expect(page.getByLabel('Add a comment')).toHaveCount(0);
    await page.goto(`/submit?${new URLSearchParams({ community: slug })}`);
    await page
      .getByLabel('Title', { exact: true })
      .fill('A post deleted from my profile');
    await page.getByLabel('Your post').fill('Checking profile deletion.');
    await page.getByRole('button', { name: 'Publish post' }).click();
    await expect(page).toHaveURL(/\/posts\//);
    postId = new URL(page.url()).pathname.split('/')[2];
    await page.goto(`/u/${username}`);
    const profilePost = page.getByTestId(`post-${postId}`);
    await profilePost
      .getByRole('button', { name: 'Post options', exact: true })
      .click();
    await profilePost
      .getByRole('button', { name: 'Delete post', exact: true })
      .click();
    await profilePost
      .getByRole('button', { name: 'Confirm delete post', exact: true })
      .click();
    await expect(profilePost).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'No posts yet', exact: true }),
    ).toBeVisible();
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
