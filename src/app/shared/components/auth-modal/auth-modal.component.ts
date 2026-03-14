import { Component, output } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-auth-modal',
  imports: [RouterLink],
  templateUrl: './auth-modal.component.html',
  styleUrl: './auth-modal.component.scss'
})
export class AuthModalComponent {
  readonly close = output<void>();

  dismiss() {
    this.close.emit();
  }
}
