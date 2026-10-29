import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, complete, chapter, subchapter } from './helpers';
for (const width of [390, 768, 1440]) {
  test(
    'SIS-001 automated accessibility at ' + width + 'px @a11y',
    async ({ student, actor, request }) => {
      await student.setViewportSize({ width, height: 900 });
      await student.goto('/student/learn/' + chapter + '/' + subchapter);
      await expect(student.getByRole('main')).toBeVisible();
      const learning = await new AxeBuilder({ page: student })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        learning.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      ).toEqual([]);
      const result = await complete(request, actor, 8);
      await student.goto('/student/drill/' + result.attemptId + '/result');
      await expect(student.getByRole('main')).toBeVisible();
      const results = await new AxeBuilder({ page: student })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      ).toEqual([]);
      expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    },
  );
}
