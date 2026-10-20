export const ADMIN_PAGE_SIZE = 5;

// Read one extra row from APIs without nextOffset to detect the final page.
export function adminPage<T>(items: T[], total?: number, offset = 0) {
  return {
    items: items.slice(0, ADMIN_PAGE_SIZE),
    hasNext:
      total === undefined ? items.length > ADMIN_PAGE_SIZE : offset + ADMIN_PAGE_SIZE < total,
  };
}
