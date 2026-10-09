/**
 * Called whenever what readers see changes: a copy is published, held or taken down.
 *
 * Reader pages render per request for now, so there is nothing to invalidate. When caching
 * arrives (M6, decision D26), this is the one place that clears the affected papers' pages.
 */
export async function contentChanged(_change: {
  tenantIds: readonly string[];
  articleId: string;
}): Promise<void> {}
