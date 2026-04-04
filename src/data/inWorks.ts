export interface InWorkProject {
  id: string;
  name: string;
  genre: string;
  description: string;
  redact: readonly (readonly [number, number])[];
}

export interface RedactionSegment {
  kind: 'text' | 'redacted';
  value: string;
}

export const inWorkProjects = [
  {
    id: 'favela-94',
    name: "Favela '94",
    genre: 'Tactical Shooter',
    description:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    redact: [[0, 334]],
  },
  {
    id: 'crowns-of-steel',
    name: 'Crowns of Steel',
    genre: 'Strategy',
    description:
      'Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam nisi ut aliquid ex ea commodi consequatur.',
    redact: [[0, 131]],
  },
] as const satisfies readonly InWorkProject[];

export function getRedactionSegments(
  text: string,
  ranges: readonly (readonly [number, number])[],
) {
  const sortedRanges = [...ranges].sort((left, right) => left[0] - right[0]);
  const segments: RedactionSegment[] = [];
  let cursor = 0;

  for (const [rawStart, rawEnd] of sortedRanges) {
    const start = Math.max(cursor, Math.min(text.length, rawStart));
    const end = Math.max(start, Math.min(text.length, rawEnd));

    if (start > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, start) });
    }

    if (end > start) {
      segments.push({ kind: 'redacted', value: '█'.repeat(end - start) });
      cursor = end;
    }
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) });
  }

  return segments;
}
