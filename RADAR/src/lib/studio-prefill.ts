export interface StudioPrefillData {
  t: string;      // title (truncated to 150 chars)
  s: string;      // source (feed name)
  i: string;      // image URL or 'empty'
  c: string;      // content_id
  b: string;      // brief headline
}

function toBase64Url(buf: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeStudioUrl(data: StudioPrefillData): string {
  const params = new URLSearchParams();
  params.set('t', data.t.slice(0, 150));
  params.set('s', data.s);
  params.set('i', data.i || 'empty');
  params.set('c', data.c);
  params.set('b', data.b.slice(0, 200));
  const json = JSON.stringify(Object.fromEntries(params));
  const encoder = new TextEncoder();
  return toBase64Url(encoder.encode(json));
}

export function decodeStudioUrl(encoded: string): StudioPrefillData | null {
  try {
    const bytes = fromBase64Url(encoded);
    const decoder = new TextDecoder();
    const json = decoder.decode(bytes);
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
  return `http://89.168.53.133:3002?prefill=${encoded}`;
}
