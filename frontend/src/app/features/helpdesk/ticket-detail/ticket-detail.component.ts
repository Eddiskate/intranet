import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HelpdeskApiService } from '../../../core/services/helpdesk-api.service';
import {
  Attachment,
  Ticket,
  TicketComment,
  TicketStatus,
  User,
} from '../../../core/models/helpdesk.models';
import { environment } from '../../../../environments/environment';

const COMMENT_DRAFT_KEY = 'helpdesk_comment_author';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe, FormsModule, ReactiveFormsModule],
  templateUrl: './ticket-detail.component.html',
  styleUrl: './ticket-detail.component.scss',
})
export class TicketDetailComponent implements OnInit {
  private readonly api = inject(HelpdeskApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly fb = inject(FormBuilder);

  readonly ticket = signal<Ticket | null>(null);
  readonly comments = signal<TicketComment[]>([]);
  readonly error = signal<string | null>(null);
  readonly preview = signal<Attachment | null>(null);
  readonly commentError = signal<string | null>(null);
  readonly commentSending = signal(false);

  readonly commentForm = this.fb.nonNullable.group({
    authorName: [''],
    authorEmail: ['', [Validators.required, Validators.email]],
    body: ['', Validators.required],
  });

  readonly statusLabels: Record<TicketStatus, string> = {
    OPEN: 'Otwarte',
    IN_PROGRESS: 'W trakcie',
    RESOLVED: 'Rozwiązane',
    CLOSED: 'Zamknięte',
  };

  ngOnInit(): void {
    const saved = localStorage.getItem(COMMENT_DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { authorName?: string; authorEmail?: string };
        this.commentForm.patchValue({
          authorName: parsed.authorName || '',
          authorEmail: parsed.authorEmail || '',
        });
      } catch {
        /* ignore */
      }
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Brak ID zgłoszenia');
      return;
    }
    this.api.getTicket(id).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.comments.set(ticket.comments ?? []);
        if (!this.commentForm.controls.authorEmail.value && ticket.requesterEmail) {
          this.commentForm.controls.authorEmail.setValue(ticket.requesterEmail);
          this.commentForm.controls.authorName.setValue(ticket.requesterName);
        }
      },
      error: () => this.error.set('Nie znaleziono zgłoszenia'),
    });
  }

  setStatus(status: TicketStatus): void {
    const current = this.ticket();
    if (!current) return;
    this.api.updateTicketStatus(current.id, status).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.comments.set(ticket.comments ?? this.comments());
      },
    });
  }

  setAssignee(assigneeId: string): void {
    const current = this.ticket();
    if (!current) return;
    this.api.assignTicket(current.id, assigneeId || null).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.comments.set(ticket.comments ?? this.comments());
      },
    });
  }

  groupMembers(ticket: Ticket): User[] {
    return (ticket.group?.members || [])
      .map((m) => m.user)
      .filter((u): u is User => Boolean(u));
  }

  submitComment(): void {
    if (this.commentForm.invalid || !this.ticket()) {
      this.commentForm.markAllAsTouched();
      return;
    }

    this.commentSending.set(true);
    this.commentError.set(null);
    const value = this.commentForm.getRawValue();

    localStorage.setItem(
      COMMENT_DRAFT_KEY,
      JSON.stringify({
        authorName: value.authorName,
        authorEmail: value.authorEmail,
      })
    );

    this.api
      .addComment(this.ticket()!.id, {
        authorEmail: value.authorEmail.trim().toLowerCase(),
        authorName: value.authorName.trim() || undefined,
        body: value.body.trim(),
      })
      .subscribe({
        next: (comment) => {
          this.comments.update((list) => [comment, ...list]);
          this.commentForm.controls.body.setValue('');
          this.commentSending.set(false);
        },
        error: () => {
          this.commentSending.set(false);
          this.commentError.set('Nie udało się dodać komentarza');
        },
      });
  }

  attachmentUrl(file: Attachment): string {
    return `${environment.uploadsUrl}/${encodeURIComponent(file.filename)}`;
  }

  safeAttachmentUrl(file: Attachment): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.attachmentUrl(file));
  }

  isImage(file: Attachment): boolean {
    return file.mimeType.startsWith('image/');
  }

  isPdf(file: Attachment): boolean {
    return file.mimeType === 'application/pdf' || file.originalName.toLowerCase().endsWith('.pdf');
  }

  openPreview(file: Attachment): void {
    this.preview.set(file);
  }

  closePreview(): void {
    this.preview.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.preview()) this.closePreview();
  }
}
