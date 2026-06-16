import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-movie-approval-contract-notification',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  templateUrl: './movie-approval-contract-notification.component.html',
  styleUrl: './movie-approval-contract-notification.component.scss',
})
export class MovieApprovalContractNotificationComponent {}
