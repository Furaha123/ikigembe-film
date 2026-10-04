import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanDeactivateFn } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

/** A page with form input that would be lost by navigating away. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/** Asks before leaving a page with unsaved input. Pair with a `beforeunload` listener for reloads and tab closes. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID)) || !component?.hasUnsavedChanges()) return true;
  return window.confirm(inject(TranslateService).instant('marketplace.wizard.leaveConfirm'));
};
