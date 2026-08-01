import { getMessages, type Locale } from '../i18n/messages';

export interface InWorkProject {
  id: string;
  name: string;
  genre: string;
  robloxUrl?: string;
  stageLabel: string;
}

const PIPELINE_PROJECTS = {
  'crowns-of-steel': {
    genre: 'Grand Strategy',
    stageLabel: 'Unannounced',
  },
  'operation-five-siege': {
    genre: 'Tactical FPS',
    stageLabel: 'Unannounced',
  },
  agmina: {
    genre: 'Tactical FPS',
    name: 'AGMINA',
    robloxUrl: 'https://www.roblox.com/games/106547075203153/AGMINA',
    stageLabel: 'Playable preview',
  },
} as const;

export function getInWorkProjects(locale: Locale): InWorkProject[] {
  const translations = getMessages(locale).catalog.inWorks;

  return Object.entries(PIPELINE_PROJECTS).map(([id, project]) => {
    const translation = translations[id as keyof typeof translations];
    return {
      id,
      name: 'name' in project ? project.name : translation.name,
      genre: project.genre,
      ...('robloxUrl' in project ? { robloxUrl: project.robloxUrl } : {}),
      stageLabel: project.stageLabel,
    };
  });
}
