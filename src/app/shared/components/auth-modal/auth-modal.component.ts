import { Component, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-auth-modal',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './auth-modal.component.html',
  styleUrl: './auth-modal.component.scss'
})
export class AuthModalComponent {
  readonly close = output<void>();

  dismiss() {
    this.close.emit();
  }
}
