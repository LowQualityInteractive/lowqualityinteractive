/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly YOUTUBE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type ThemeMode = 'light' | 'system' | 'dark';

interface LqiThemeController {
  get(): ThemeMode;
  set(theme: ThemeMode): void;
  grantConsent(): void;
  hasConsent(): boolean;
  syncThemeControl(): void;
}

interface LqiMotionController {
  replaceChildren(root: HTMLElement, children: Node[]): void;
  enter(root: HTMLElement): void;
  reveal(element: HTMLElement): void;
}

type MotionMode = 'motion' | 'reduced' | 'none';

interface LqiMotionPreferenceController {
  get(): MotionMode;
  set(mode: MotionMode): void;
  syncMotionControl(): void;
}

interface LqiLoaderController {
  show(): void;
  hide(): void;
}

interface Window {
  __lqiMotion?: LqiMotionController;
  __lqiMotionPreference?: LqiMotionPreferenceController;
  __lqiTheme?: LqiThemeController;
  __lqiLoader?: LqiLoaderController;
}
