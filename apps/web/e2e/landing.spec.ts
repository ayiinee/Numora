import { expect, test } from '@playwright/test';

test('public landing keeps the full section order and social links across desktop and mobile', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Latihan TKA Matematika untuk siswa SMP/MTs',
  );
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
    'Latihan singkat dan bertahap',
    'Belajar dari pembahasan',
    'Pantau progres dan bintang',
    'Pilih materi dan level',
    'Belajar lewat browser',
    'Belajar bersama sekolah',
    'Persiapan TKA Matematika',
    'Siap latihan bersama Numora?',
  ]);
  const footer = page.getByRole('navigation', { name: 'Navigasi footer' });
  await expect(footer.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
    'href',
    'https://www.instagram.com/hellonumora/',
  );
  await expect(footer.getByRole('link', { name: 'TikTok' })).toHaveAttribute(
    'href',
    'https://www.tiktok.com/@hellonumora',
  );
  for (const width of [1440, 1080, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await footer.getByRole('link', { name: 'Persiapan TKA', exact: true }).click();
  await expect(page).toHaveURL(/#persiapan-tka$/);
  await page.getByRole('link', { name: 'Lihat latihan', exact: true }).click();
  await expect(page).toHaveURL(/#cara-belajar$/);
});

test('landing account dialog returns focus and offers shared login controls with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('form', { name: 'Login Siswa', includeHidden: true })).toHaveCount(0);
  const account = page.getByRole('button', { name: 'Sudah punya akun' });
  await account.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Masuk ke Numora' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(account).toBeFocused();
  await expect(page.getByRole('button', { name: 'Jeda gerak kategori' })).toHaveCount(0);
  const assessment = page.getByRole('region', { name: 'Persiapan TKA Matematika' });
  expect(
    await assessment
      .getByRole('img')
      .evaluate((image) => image.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('form', { name: 'Login Siswa' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Lanjutkan dengan Google' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Masuk Admin' })).toHaveCount(0);
  await expect(page).toHaveURL('http://localhost:3300/');
  const close = dialog.getByRole('button', { name: 'Tutup dialog' });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Lanjutkan dengan Google' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await close.click();
  await expect(account).toBeFocused();
});

test('scrolled mobile header fits at 200% text size', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.locator('#pembahasan').scrollIntoViewIfNeeded();
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Mulai belajar', exact: true })).toBeVisible();
  expect(
    await header.evaluate((element) => {
      const header = element.getBoundingClientRect();
      return [...element.querySelectorAll('a')].every((link) => {
        const rect = link.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          rect.top >= header.top &&
          rect.bottom <= header.bottom
        );
      });
    }),
  ).toBe(true);
});
