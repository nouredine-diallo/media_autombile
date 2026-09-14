function toBase64Url(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildPrefillUrl(base, path, { title, source, imageUrl, contentId, briefHeadline }) {
  const params = new URLSearchParams();
  params.set('t', title.slice(0, 150));
  params.set('s', source);
  params.set('i', imageUrl || 'empty');
  params.set('c', contentId);
  params.set('b', briefHeadline.slice(0, 200));
  const json = JSON.stringify(Object.fromEntries(params));
  const encoded = toBase64Url(json);
  return `${base}${path}?prefill=${encoded}`;
}
