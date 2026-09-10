/** Binary history carries base64 before/after bytes; ordinary image imports stay at 8 MiB. */
export function studioRequestBodyLimit(url: string) {
  if (/^\/api\/ari\/projects\/[^/]+\/versions\//.test(url)) return 48 * 1024 * 1024;
  return url.startsWith("/api/ari/") ? 8 * 1024 * 1024 : undefined;
}
export async function readNodeRequestBody(
  req: AsyncIterable<string | Uint8Array>,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<Buffer> {
  let size = 0;
  const chunks: Uint8Array[] = [];

  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes)
      throw new RangeError(
        `Tiedosto on liian suuri. Enimmäiskoko on ${maxBytes / (1024 * 1024)} MiB.`,
      );
    chunks.push(bytes);
  }

  return Buffer.concat(chunks);
}
