export const ADMIN_PAGE_SIZE = 10;

// Read one extra row from APIs without nextOffset to detect the final page.
export function adminPage<T>(items: T[], totalItems?: number) {
  return {
    items: items.slice(0, ADMIN_PAGE_SIZE),
    hasNext: items.length > ADMIN_PAGE_SIZE,
    totalItems,
  };
}
