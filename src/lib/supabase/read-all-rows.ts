interface PageResult<Row> {
  data: Row[] | null;
  error: { message: string } | null;
}

// Keep requests below the API row cap; callers must supply deterministic ordering.
export async function readAllRows<Row>(
  fetchPage: (first: number, last: number) => PromiseLike<PageResult<Row>>,
  context: string,
) {
  const rows: Row[] = [];
  const pageSize = 500;
  for (let first = 0; ; first += pageSize) {
    const result = await fetchPage(first, first + pageSize - 1);
    if (result.error) throw new Error(`${context}: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
