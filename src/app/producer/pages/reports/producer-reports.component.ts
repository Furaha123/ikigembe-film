import { Component } from '@angular/core';
import { ProducerRevenueTrendComponent }   from './revenue-trend/producer-revenue-trend.component';
import { ProducerEarningsReportComponent } from './earnings-report/producer-earnings-report.component';
import { ProducerTransactionsComponent }   from './transactions/producer-transactions.component';

@Component({
  selector: 'app-producer-reports',
  standalone: true,
  imports: [
    ProducerRevenueTrendComponent,
    ProducerEarningsReportComponent,
    ProducerTransactionsComponent,
  ],
  templateUrl: './producer-reports.component.html',
  styleUrl: './producer-reports.component.scss',
})
export class ProducerReportsComponent {}
