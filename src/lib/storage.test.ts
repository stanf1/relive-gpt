import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { loadActivities, saveActivity, deleteActivity } from './storage';
import { demoActivity } from './demo';

describe('local activity database', () => {
  it('saves multiple records, orders them, updates names and deletes only the target', async () => {
    const first = { ...demoActivity, id: 'test-first', demo: false, importedAt: 1 };
    const second = { ...demoActivity, id: 'test-second', demo: false, importedAt: 2 };
    await saveActivity(first);
    await saveActivity(second);
    expect((await loadActivities()).map((item) => item.id)).toEqual(['test-second', 'test-first']);
    await saveActivity({ ...first, name: '新的旅程名稱' });
    expect((await loadActivities()).find((item) => item.id === first.id)?.name).toBe('新的旅程名稱');
    await deleteActivity(second.id);
    const remaining = await loadActivities();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].points).toEqual(first.points);
    await deleteActivity(first.id);
    expect(await loadActivities()).toEqual([]);
  });
});
