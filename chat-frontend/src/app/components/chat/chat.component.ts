import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ZardSidebarImports } from '@/shared/components/sidebar/sidebar.imports';

import { HeaderComponent } from '../layout/header/header.component';
import { SidebarComponent } from '../layout/sidebar/sidebar.component';

/**
 * Chat shell: the app bar spans the full width on top, the sidebar rail and the
 * active conversation context (DM list, public room list) sit side by side
 * underneath it. `z-sidebar-provider` has to wrap the header too — that is where
 * `ZardSidebarService`, which the header's toggle injects, is provided.
 */
@Component({
  selector: 'chat-container',
  standalone: true,
  imports: [ZardSidebarImports, RouterOutlet, HeaderComponent, SidebarComponent],
  host: {
    class: 'block h-full w-full overflow-hidden bg-canvas',
  },
  // `flex-col` stacks the header above the row; `h-full`/`min-h-0` replace the
  // provider's `min-h-svh`, which would force a scrollbar in the fixed-size
  // desktop window.
  template: `
    <z-sidebar-provider class="h-full min-h-0 flex-col">
      <app-layout-header />

      <div class="flex min-h-0 flex-1">
        <app-layout-sidebar />

        <!-- m-2 ml-0 keeps the rail flush while the content floats. The rail and the
             app bar are both canvas (sidebar tracks it in styles.css); muted is
             the one step up from it, so the content card reads as the raised
             surface. -->
        <main class="m-2 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-muted shadow-sm">
          <router-outlet />
        </main>
      </div>
    </z-sidebar-provider>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent {}