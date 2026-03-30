import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../../services/admin.service';
import { ProducerItem } from '../../models/admin.interface';

interface FieldErrors {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
}

@Component({
  selector: 'app-admin-producers',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-producers.component.html',
  styleUrl: './admin-producers.component.scss'
})
export class AdminProducersComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly fb = inject(FormBuilder);

  producers = signal<ProducerItem[]>([]);
  isLoading = signal(true);
  actionId = signal<number | null>(null);
  showAddModal = signal(false);
  isSaving = signal(false);
  apiErrors = signal<FieldErrors>({});
  generatedPassword = signal<string | null>(null);

  form = this.fb.group({
    first_name:   ['', Validators.required],
    last_name:    ['', Validators.required],
    email:        ['', [Validators.required, Validators.email]],
    phone_number: ['', Validators.required],
  });

  ngOnInit() {
    this.loadProducers();
  }

  loadProducers() {
    this.isLoading.set(true);
    this.adminService.getProducers().subscribe({
      next: (data) => { this.producers.set(data); this.isLoading.set(false); },
      error: () => this.isLoading.set(false),
    });
  }

  dismissPassword() { this.generatedPassword.set(null); }

  openAddModal() {
    this.form.reset();
    this.apiErrors.set({});
    this.showAddModal.set(true);
  }

  closeAddModal() {
    this.showAddModal.set(false);
    this.apiErrors.set({});
  }

  // Clear a field's API error as soon as the user edits it
  clearFieldError(field: keyof FieldErrors) {
    this.apiErrors.update(e => ({ ...e, [field]: undefined }));
  }

  saveProducer() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.isSaving.set(true);
    this.apiErrors.set({});

    const payload = this.form.value as {
      first_name: string; last_name: string;
      email: string; phone_number: string;
    };

    this.adminService.createProducer(payload).subscribe({
      next: (res: any) => {
        this.isSaving.set(false);
        this.closeAddModal();
        if (res?.generated_password) {
          this.generatedPassword.set(res.generated_password);
        }
        this.loadProducers();
      },
      error: (err) => {
        this.isSaving.set(false);
        const body = err?.error ?? {};
        const errors: FieldErrors = {};

        // Field-level errors (array format: { email: ["msg"] })
        if (body.email)        errors.email        = Array.isArray(body.email)        ? body.email[0]        : body.email;
        if (body.phone_number) errors.phone_number = Array.isArray(body.phone_number) ? body.phone_number[0] : body.phone_number;
        if (body.first_name)   errors.first_name   = Array.isArray(body.first_name)   ? body.first_name[0]   : body.first_name;
        if (body.last_name)    errors.last_name    = Array.isArray(body.last_name)    ? body.last_name[0]    : body.last_name;

        // Flat error message e.g. { "error": "A user with this phone number already exists." }
        if (!Object.keys(errors).length && body.error) {
          const msg: string = body.error;
          if (msg.toLowerCase().includes('phone'))  errors.phone_number = msg;
          else if (msg.toLowerCase().includes('email')) errors.email    = msg;
          else errors.phone_number = msg; // fallback: show under phone
        }

        // Generic detail fallback — show under phone_number so it's visible on the form
        if (!Object.keys(errors).length && body.detail) {
          errors.phone_number = body.detail;
        }

        this.apiErrors.set(errors);
      },
    });
  }

  approve(id: number) {
    this.actionId.set(id);
    this.adminService.approveProducer(id).subscribe({
      next: () => {
        this.producers.update(list => list.map(p => p.id === id ? { ...p, is_active: true } : p));
        this.actionId.set(null);
      },
      error: () => this.actionId.set(null),
    });
  }

  suspend(id: number) {
    this.actionId.set(id);
    this.adminService.suspendProducer(id).subscribe({
      next: () => {
        this.producers.update(list => list.map(p => p.id === id ? { ...p, is_active: false } : p));
        this.actionId.set(null);
      },
      error: () => this.actionId.set(null),
    });
  }

  getInitials(name: string): string {
    return name?.slice(0, 2).toUpperCase() ?? '??';
  }
}
