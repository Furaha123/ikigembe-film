import { Component } from '@angular/core';
import { RevenueTrendComponent }      from './revenue-trend/revenue-trend.component';
import { TopMoviesComponent }         from './top-movies/top-movies.component';
import { UserGrowthComponent }        from './user-growth/user-growth.component';
import { WithdrawalSummaryComponent } from './withdrawal-summary/withdrawal-summary.component';
import { PayingUsersComponent }       from './paying-users/paying-users.component';

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [
    RevenueTrendComponent,
    TopMoviesComponent,
    UserGrowthComponent,
    WithdrawalSummaryComponent,
    PayingUsersComponent,
  ],
  templateUrl: './admin-reports.component.html',
  styleUrl: './admin-reports.component.scss',
})
export class AdminReportsComponent {}
