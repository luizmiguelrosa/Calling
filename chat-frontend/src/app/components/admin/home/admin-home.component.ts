import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Landing route for `/admin`; `adminHomeGuard` immediately redirects away. */
@Component({
  selector: 'admin-home',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminHomeComponent {}