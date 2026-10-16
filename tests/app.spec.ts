import { test, expect } from '@playwright/test';

const fixture = (name: string, elevation = true) => Buffer.from(`<?xml version="1.0"?><gpx version="1.1"><trk><name>${name}</name><trkseg><trkpt lat="24.138" lon="121.281">${elevation ? '<ele>3000</ele><time>2026-10-10T00:00:00Z</time>' : ''}</trkpt><trkpt lat="24.148" lon="121.280">${elevation ? '<ele>3100</ele><time>2026-10-10T00:20:00Z</time>' : ''}</trkpt><trkpt lat="24.158" lon="121.275">${elevation ? '<ele>3050</ele><time>2026-10-10T00:40:00Z</time>' : ''}</trkpt></trkseg></trk></gpx>`);

test('imports, replays, renames, persists and deletes independent activities', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('合歡山・稜線上的日常');
  await expect(page.getByRole('button', { name: '匯入 GPX', exact: true })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles([
    { name: 'first.gpx', mimeType: 'application/gpx+xml', buffer: fixture('我的第一段旅程') },
    { name: 'second.gpx', mimeType: 'application/gpx+xml', buffer: fixture('無海拔的散步', false) },
  ]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('無海拔的散步');
  await expect(page.getByText('此 GPX 未包含海拔資料，仍可重播路徑。')).toBeVisible();
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: '我的旅程', exact: true }).click();
  await page.getByRole('button', { name: /我的第一段旅程/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('我的第一段旅程');
  await page.getByRole('button', { name: '開始重播' }).click();
  await expect(page.getByRole('button', { name: '視角跟隨' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Number(await page.getByRole('slider', { name: '重播進度', exact: true }).inputValue())).toBeGreaterThan(0);
  await page.getByRole('button', { name: '暫停重播' }).click();
  await page.getByRole('button', { name: '視角跟隨' }).click();
  await expect(page.getByRole('button', { name: '視角跟隨' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '重新命名旅程' }).click();
  await page.getByRole('textbox', { name: '旅程名稱' }).fill('山裡的週末');
  await page.getByRole('button', { name: '保存名稱' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('山裡的週末');
  await page.reload();
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: '我的旅程', exact: true }).click();
  await expect(page.getByRole('button', { name: /山裡的週末/ })).toBeVisible();
  await page.getByRole('button', { name: /山裡的週末/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('山裡的週末');
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByRole('button', { name: '2D', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '3D 地形', exact: true }).click();
  await page.getByRole('button', { name: '衛星影像底圖' }).click();
  await expect(page.getByRole('button', { name: '衛星影像底圖' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '地圖底圖' }).click();
  await expect(page.getByRole('button', { name: '地圖底圖' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '顯示完整路線' }).click();
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await expect(page.locator('.map-warning.fatal')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('activity.png'), fullPage: true });
  await page.getByRole('button', { name: '刪除目前旅程' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '保留旅程' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('山裡的週末');
  await page.getByRole('button', { name: '刪除目前旅程' }).click();
  await page.getByRole('button', { name: '確認刪除' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('無海拔的散步');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('無海拔的散步');
  expect(errors).toEqual([]);
});

test('rejects invalid GPX without saving it and displays privacy information', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入 GPX', exact: true })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from('<gpx/>') });
  await expect(page.getByRole('alert')).toContainText('找不到足夠的路徑點');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('合歡山・稜線上的日常');
  await page.getByRole('button', { name: '使用說明與資料隱私' }).click();
  await expect(page.getByRole('dialog')).toContainText('IndexedDB');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
