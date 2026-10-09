/** The Google Identity Services global (loaded by a script tag), as far as sign-out uses it. */
declare const google: { accounts: { id: { disableAutoSelect(): void } } };

import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
router = inject(Router);

signOut(){
  google.accounts.id.disableAutoSelect();
  this.router.navigate(['/'])
}

}
