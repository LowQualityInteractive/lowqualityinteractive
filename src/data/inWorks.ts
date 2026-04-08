import { getMessages, type Locale } from '../i18n/messages';

export interface InWorkProject {
  id: string;
  name: string;
  genre: string;
  redactedDescription: string;
}

const REDACTION_LENGTHS = {
  'crowns-of-steel': 131,
} as const;

export function getInWorkProjects(locale: Locale): InWorkProject[] {
  const translations = getMessages(locale).catalog.inWorks;

  return Object.entries(REDACTION_LENGTHS).map(([id, redactionLength]) => ({
    id,
    name: translations[id as keyof typeof translations].name,
    genre: translations[id as keyof typeof translations].genre,
    redactedDescription: '█'.repeat(redactionLength),
  }));
}
