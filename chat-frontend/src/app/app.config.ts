import { provideZard } from '@/shared/core/provider/providezard';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from "@angular/core";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideRouter } from "@angular/router";

import { routes } from "./app.routes";
import { provideNgGlyphsConfig } from '@ng-icons/core';

import { authInterceptor } from './interceptors/auth.interceptor';
import { ApiConfigService } from './services/api-config.service';
import { ImageCacheService } from './services/image-cache.service';
import { StartupService } from './services/startup.service';
import { ThemeService } from './services/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])), provideZard(), provideNgGlyphsConfig({
      size: 16
    }),
    // The backend address has to be settled before the first request leaves, and
    // resolving it crosses the Tauri IPC boundary, so bootstrap waits on it.
    provideAppInitializer(() => inject(ApiConfigService).init()),
    // Likewise for the theme: applying it after the first paint would flash the
    // light palette at a user who chose dark.
    provideAppInitializer(() => inject(ThemeService).init()),
    // The startup preference is read before the first navigation so the guard can
    // restore the last conversation or fall back to the home screen.
    provideAppInitializer(() => inject(StartupService).init()),
    // Expired images are swept in the background. The initializer deliberately
    // does not return the promise, so bootstrap is never held up by the sweep.
    provideAppInitializer(() => inject(ImageCacheService).scheduleCleanup()),
  ],
};
