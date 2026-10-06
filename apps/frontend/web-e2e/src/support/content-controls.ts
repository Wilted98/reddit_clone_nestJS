import { expect, Locator } from '@playwright/test';

export async function expectHeaderOptions(card: Locator) {
  await expect(
    card.locator(':scope > .content-actions-idle > .content-options'),
  ).toBeVisible();
  const bounds = await card.evaluate((element) => {
    const header = element.querySelector(
      ':scope > .post-meta, :scope > header',
    );
    const actions = element.querySelector(':scope > .content-actions-idle');
    const options = actions?.querySelector('.content-options');
    if (!header || !actions || !options)
      throw new Error('Missing header options');
    const metadata = header.getBoundingClientRect();
    const button = options.getBoundingClientRect();
    return {
      top: button.top,
      right: button.right,
      headerTop: metadata.top,
      headerBottom: metadata.bottom,
      cardRight: element.getBoundingClientRect().right,
      footerHeight: actions.getBoundingClientRect().height,
      overlap: [...header.children].some((child) => {
        const rect = child.getBoundingClientRect();
        return (
          rect.right > button.left &&
          rect.left < button.right &&
          rect.bottom > button.top &&
          rect.top < button.bottom
        );
      }),
    };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(bounds.headerTop - 1);
  expect(bounds.top).toBeLessThan(bounds.headerBottom);
  expect(bounds.right).toBeLessThanOrEqual(bounds.cardRight);
  expect(bounds.cardRight - bounds.right).toBeLessThanOrEqual(25);
  expect(bounds.footerHeight).toBe(0);
  expect(bounds.overlap).toBe(false);
}
