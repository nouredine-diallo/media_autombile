export interface PrefillData {
  t: string;  // title (theme for generation)
  s: string;  // source (feed name)
  i: string;  // image URL or 'empty'
  c: string;  // content_id
  b: string;  // brief headline
}

export function decodePrefill(encoded: string): PrefillData | null {
  try {
    const json = decodeURIComponent(
      atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
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
