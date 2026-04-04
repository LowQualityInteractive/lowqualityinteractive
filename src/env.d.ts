/// <reference path="../.astro/types.d.ts" />

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
