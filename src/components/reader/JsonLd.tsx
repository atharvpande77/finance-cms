/**
 * Structured data as a native script tag (Next's JSON-LD guide). The JSON is escaped so no
 * value can close the tag: this is the one place markup is set directly.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
