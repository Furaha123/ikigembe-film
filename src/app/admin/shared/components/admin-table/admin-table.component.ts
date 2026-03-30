import {
  Component, Input, TemplateRef, signal, computed, OnChanges, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableColumn } from './table-column.interface';

const AVATAR_COLORS = [
  '#7c3aed','#2563eb','#059669','#d97706',
  '#dc2626','#0891b2','#9333ea','#16a34a',
];

@Component({
  selector: 'app-admin-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-table.component.html',
  styleUrl: './admin-table.component.scss',
})
export class AdminTableComponent implements OnChanges {
  @Input() columns: TableColumn[] = [];
  @Input() data: Record<string, unknown>[] = [];
  @Input() loading = false;
  @Input() searchable = true;
  @Input() actionsTemplate?: TemplateRef<{ $implicit: Record<string, unknown> }>;

  readonly rowsOptions = [5, 10, 25, 50];

  searchQuery = signal('');
  rowsPerPage = signal(10);
  currentPage = signal(1);

  private source = signal<Record<string, unknown>[]>([]);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['data']) {
      this.source.set(this.data ?? []);
      this.currentPage.set(1);
    }
  }

  filtered = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.source();
    return this.source().filter(row =>
      this.columns.some(col => String(row[col.key] ?? '').toLowerCase().includes(q))
    );
  });

  totalRows   = computed(() => this.filtered().length);
  totalPages  = computed(() => Math.max(1, Math.ceil(this.totalRows() / this.rowsPerPage())));
  rangeStart  = computed(() => Math.min((this.currentPage() - 1) * this.rowsPerPage() + 1, this.totalRows()));
  rangeEnd    = computed(() => Math.min(this.currentPage() * this.rowsPerPage(), this.totalRows()));

  pagedRows = computed(() => {
    const start = (this.currentPage() - 1) * this.rowsPerPage();
    return this.filtered().slice(start, start + this.rowsPerPage());
  });

  visiblePages = computed<(number | '...')[]>(() => {
    const total = this.totalPages();
    const cur   = this.currentPage();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (cur > 3) pages.push('...');
    for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) pages.push(i);
    if (cur < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  });

  onSearch(q: string) { this.searchQuery.set(q); this.currentPage.set(1); }
  onRowsChange(n: number) { this.rowsPerPage.set(+n); this.currentPage.set(1); }
  goToPage(p: number | '...') { if (typeof p === 'number') this.currentPage.set(p); }
  prevPage() { if (this.currentPage() > 1) this.currentPage.update(p => p - 1); }
  nextPage() { if (this.currentPage() < this.totalPages()) this.currentPage.update(p => p + 1); }

  // Cell helpers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cellValue(row: Record<string, unknown>, key: string): any {
    return row[key];
  }

  getInitials(value: unknown): string {
    const name = String(value ?? '').trim();
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return '?';
  }

  getAvatarColor(value: unknown): string {
    const name = String(value ?? '');
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  isActive(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    const s = String(value).toLowerCase();
    return s === 'active' || s === 'true' || s === '1';
  }

  statusLabel(value: unknown): string {
    if (typeof value === 'boolean') return value ? 'Active' : 'Inactive';
    return String(value ?? '');
  }
}
