/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly YOUTUBE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type ThemeName = 'light' | 'dark';

interface LqiThemeController {
  get(): ThemeName;
  set(theme: ThemeName): void;
  toggle(): void;
  grantConsent(): void;
  hasConsent(): boolean;
  syncToggleButton(): void;
}

interface Window {
  __lqiTheme?: LqiThemeController;
}
