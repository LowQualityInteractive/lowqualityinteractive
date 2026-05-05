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

interface LqiMotionController {
  replaceChildren(root: HTMLElement, children: Node[]): void;
  enter(root: HTMLElement): void;
}

interface LqiLoaderController {
  show(): void;
  hide(): void;
}

interface Window {
  __lqiMotion?: LqiMotionController;
  __lqiTheme?: LqiThemeController;
  __lqiLoader?: LqiLoaderController;
}
