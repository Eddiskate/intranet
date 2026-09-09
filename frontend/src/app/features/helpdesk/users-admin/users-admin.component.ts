import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HelpdeskApiService } from '../../../core/services/helpdesk-api.service';
import { TicketGroup, User } from '../../../core/models/helpdesk.models';

@Component({
  selector: 'app-users-admin',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './users-admin.component.html',
  styleUrl: './users-admin.component.scss',
})
export class UsersAdminComponent implements OnInit {
  private readonly api = inject(HelpdeskApiService);
  private readonly fb = inject(FormBuilder);

  readonly users = signal<User[]>([]);
  readonly groups = signal<TicketGroup[]>([]);
  readonly departments = signal<string[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    department: ['', Validators.required],
    role: this.fb.nonNullable.control<'STAFF' | 'AGENT' | 'ADMIN'>('AGENT'),
    groupIds: this.fb.nonNullable.control<string[]>([]),
  });

  ngOnInit(): void {
    this.reload();
    this.api.getUserDepartments().subscribe({
      next: (deps) => this.departments.set(deps),
      error: () =>
        this.departments.set([
          'IT',
          'Aparatura medyczna',
          'Telefony i kontrola dostępu',
          'Dział Techniczny',
          'Administracja',
          'Inny',
        ]),
    });
    this.api.getGroups().subscribe({
      next: (groups) => this.groups.set(groups),
    });
  }

  reload(): void {
    this.api.getUsers().subscribe({
      next: (users) => this.users.set(users),
      error: () => this.error.set('Nie udało się pobrać użytkowników'),
    });
  }

  startCreate(): void {
    this.editingId.set(null);
    this.form.reset({
      firstName: '',
      lastName: '',
      email: '',
      department: '',
      role: 'AGENT',
      groupIds: [],
    });
  }

  startEdit(user: User): void {
    this.editingId.set(user.id);
    this.form.setValue({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      department: user.department,
      role: user.role,
      groupIds: user.groups?.map((g) => g.groupId) ?? [],
    });
  }

  toggleGroup(groupId: string, checked: boolean): void {
    const current = this.form.controls.groupIds.value;
    this.form.controls.groupIds.setValue(
      checked ? [...current, groupId] : current.filter((id) => id !== groupId)
    );
  }

  isGroupSelected(groupId: string): boolean {
    return this.form.controls.groupIds.value.includes(groupId);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Uzupełnij wymagane pola (imię, nazwisko, e-mail, dział).');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    const payload = this.form.getRawValue();
    const id = this.editingId();
    const req = id
      ? this.api.updateUser(id, payload)
      : this.api.createUser(payload);

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.startCreate();
        this.reload();
        this.api.getGroups().subscribe({ next: (groups) => this.groups.set(groups) });
      },
      error: (err) => {
        this.saving.set(false);
        const msg =
          err?.error?.error?.formErrors?.[0] ||
          err?.error?.error ||
          'Nie udało się zapisać użytkownika (sprawdź e-mail / API).';
        this.error.set(typeof msg === 'string' ? msg : 'Nie udało się zapisać użytkownika');
      },
    });
  }

  remove(user: User): void {
    if (!confirm(`Usunąć użytkownika ${user.firstName} ${user.lastName}?`)) return;
    this.api.deleteUser(user.id).subscribe({
      next: () => this.reload(),
      error: () => this.error.set('Nie udało się usunąć użytkownika'),
    });
  }

  groupNames(user: User): string {
    return (
      user.groups?.map((g) => g.group?.name).filter(Boolean).join(', ') || '—'
    );
  }
}
