import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HelpdeskApiService } from '../../../core/services/helpdesk-api.service';
import { TicketGroup } from '../../../core/models/helpdesk.models';

@Component({
  selector: 'app-ticket-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './ticket-form.component.html',
  styleUrl: './ticket-form.component.scss',
})
export class TicketFormComponent implements OnInit {
  private readonly api = inject(HelpdeskApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly group = signal<TicketGroup | null>(null);
  readonly units = signal<string[]>([]);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal(false);
  readonly files = signal<File[]>([]);
  readonly dragOver = signal(false);
  readonly ipAutoFilled = signal(false);

  readonly maxFiles = 5;
  readonly maxFileSize = 4 * 1024 * 1024;

  readonly form = this.fb.nonNullable.group({
    requesterName: ['', Validators.required],
    requesterEmail: ['', [Validators.required, Validators.email]],
    organizationalUnit: ['', Validators.required],
    room: ['', Validators.required],
    phone: ['', Validators.required],
    subject: ['', Validators.required],
    body: ['', Validators.required],
    computerIp: [''],
  });

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('groupSlug');
    if (!slug) {
      this.error.set('Brak grupy zgłoszeń');
      this.loading.set(false);
      return;
    }

    this.api.getGroup(slug).subscribe({
      next: (group) => {
        this.group.set(group);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Nie znaleziono grupy zgłoszeń');
        this.loading.set(false);
      },
    });

    this.api.getOrganizationalUnits().subscribe({
      next: (units) => this.units.set(units),
    });

    this.api.getClientIp().subscribe({
      next: ({ ip }) => {
        if (!ip) return;
        this.form.controls.computerIp.setValue(ip);
        this.ipAutoFilled.set(true);
      },
    });
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(input.files);
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
    this.addFiles(event.dataTransfer?.files ?? null);
  }

  addFiles(list: FileList | null): void {
    if (!list?.length) return;

    const incoming = Array.from(list);
    const tooLarge = incoming.find((f) => f.size > this.maxFileSize);
    if (tooLarge) {
      this.error.set(`Plik „${tooLarge.name}” przekracza 4 MB`);
      return;
    }

    const current = this.files();
    const merged = [...current];
    for (const file of incoming) {
      const duplicate = merged.some(
        (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
      );
      if (!duplicate) merged.push(file);
    }

    if (merged.length > this.maxFiles) {
      this.error.set(`Możesz dodać maksymalnie ${this.maxFiles} plików`);
      this.files.set(merged.slice(0, this.maxFiles));
      return;
    }

    this.files.set(merged);
    this.error.set(null);
  }

  removeFile(index: number): void {
    this.files.update((list) => list.filter((_, i) => i !== index));
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  submit(): void {
    if (this.form.invalid || !this.group()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    const value = this.form.getRawValue();

    this.api
      .createTicket({
        groupId: this.group()!.id,
        ...value,
        computerIp: value.computerIp || undefined,
        attachments: this.files(),
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.success.set(true);
          setTimeout(() => this.router.navigate(['/helpdesk']), 1800);
        },
        error: () => {
          this.submitting.set(false);
          this.error.set('Nie udało się utworzyć zgłoszenia');
        },
      });
  }
}
