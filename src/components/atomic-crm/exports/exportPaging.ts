// Reads every row a query matches, a page at a time. The database returns at most 1,000
// rows per request, so a month of transactions needs several requests.
export const PAGE_SIZE = 1000;
export const MAX_EXPORT_ROWS = 50000;

type Page<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

export const fetchAllRows = async <T>(
  pageAt: (from: number, to: number) => Page<T>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let start = 0; start < MAX_EXPORT_ROWS; start += PAGE_SIZE) {
    const { data, error } = await pageAt(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
};
