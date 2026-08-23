export interface StudioPrefillData {
  t: string;      // title (truncated to 150 chars)
  s: string;      // source (feed name)
  i: string;      // image URL or 'empty'
  c: string;      // content_id
  b: string;      // brief headline
}

export function encodeStudioUrl(data: StudioPrefillData): string {
  const params = new URLSearchParams();
  params.set('t', data.t.slice(0, 150));
  params.set('s', data.s);
  params.set('i', data.i || 'empty');
  params.set('c', data.c);
  params.set('b', data.b.slice(0, 200));
  const json = JSON.stringify(Object.fromEntries(params));
  return Buffer.from(json, 'utf-8').toString('base64url');
}

export function decodeStudioUrl(encoded: string): StudioPrefillData | null {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf-8');
    const data = JSON.parse(json);
    return {
      t: data.t || '',
      s: data.s || '',
      i: data.i || 'empty',
      c: data.c || '',
      b: data.b || '',
    };
  } catch {
    return null;
  }
}

export function buildStudioLink(params: {
  title: string;
  source: string;
  imageUrl: string | null;
  contentId: string;
  briefHeadline: string;
}): string {
  const encoded = encodeStudioUrl({
    t: params.title,
    s: params.source,
    i: params.imageUrl || 'empty',
    c: params.contentId,
    b: params.briefHeadline,
  });
  return `http://localhost:3001?prefill=${encoded}`;
}
