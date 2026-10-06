import {
  parseSidebarPreferences,
  readSidebarPreferences,
  SIDEBAR_PREFERENCES_KEY,
  subscribeSidebarPreferences,
  toggleSidebarSection,
} from './sidebar-preferences';

describe('sidebar preferences', () => {
  let unsubscribe: () => void;
  beforeEach(() => {
    localStorage.clear();
    unsubscribe = subscribeSidebarPreferences(jest.fn());
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
  });
  afterEach(() => {
    unsubscribe();
    jest.restoreAllMocks();
  });

  it.each([null, 'bad-json', 'null', '[]', '{"recent":"false"}'])(
    'opens both sections for missing or invalid preferences: %s',
    (value) => {
      expect(parseSidebarPreferences(value)).toEqual({
        recent: true,
        subscriptions: true,
      });
    },
  );
  it('defaults missing sections and discards unrelated fields', () => {
    expect(
      parseSidebarPreferences('{"recent":false,"email":"private"}'),
    ).toEqual({ recent: false, subscriptions: true });
  });
  it('toggles each section without changing the other and persists only booleans', () => {
    toggleSidebarSection('recent');
    expect(parseSidebarPreferences(readSidebarPreferences())).toEqual({
      recent: false,
      subscriptions: true,
    });
    toggleSidebarSection('subscriptions');
    expect(
      JSON.parse(localStorage.getItem(SIDEBAR_PREFERENCES_KEY) ?? '{}'),
    ).toEqual({ recent: false, subscriptions: false });
    toggleSidebarSection('recent');
    expect(parseSidebarPreferences(readSidebarPreferences())).toEqual({
      recent: true,
      subscriptions: false,
    });
  });
  it('notifies subscribers for local changes and relevant cross-tab updates only', () => {
    const listener = jest.fn();
    const stop = subscribeSidebarPreferences(listener);
    toggleSidebarSection('recent');
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(
      new StorageEvent('storage', { key: SIDEBAR_PREFERENCES_KEY }),
    );
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    toggleSidebarSection('subscriptions');
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it('retains global state when reads and writes are blocked', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    toggleSidebarSection('recent');
    toggleSidebarSection('subscriptions');
    expect(parseSidebarPreferences(readSidebarPreferences())).toEqual({
      recent: false,
      subscriptions: false,
    });
  });
  it('uses the in-memory preference if writing fails but reading still succeeds', () => {
    localStorage.setItem(
      SIDEBAR_PREFERENCES_KEY,
      '{"recent":true,"subscriptions":true}',
    );
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    toggleSidebarSection('recent');
    expect(parseSidebarPreferences(readSidebarPreferences()).recent).toBe(
      false,
    );
    toggleSidebarSection('recent');
    expect(parseSidebarPreferences(readSidebarPreferences()).recent).toBe(true);
  });
});
