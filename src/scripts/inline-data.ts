// Serialize build-time data for an inline JavaScript literal. JSON escaping
// protects the string grammar; escaping every less-than sign prevents an
// embedded value from ever forming an HTML </script> token. The two Unicode
// line separators are escaped for older JavaScript parsers.
export function serializeInlineData(value: unknown): string {
  const json = JSON.stringify(value) ?? 'null';
  return json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
