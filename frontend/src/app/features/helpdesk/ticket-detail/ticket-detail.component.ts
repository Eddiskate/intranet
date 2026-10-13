import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { HelpdeskApiService } from '../../../core/services/helpdesk-api.service';
import {
  Attachment,
  Ticket,
  TicketComment,
  TicketStatus,
  TimelineEvent,
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
  readonly auth = inject(AuthService);

  readonly ticket = signal<Ticket | null>(null);
  readonly comments = signal<TicketComment[]>([]);
  readonly timeline = signal<TimelineEvent[]>([]);
  readonly error = signal<string | null>(null);
  readonly preview = signal<Attachment | null>(null);
  readonly commentError = signal<string | null>(null);
  readonly commentSending = signal(false);

  readonly commentForm = this.fb.nonNullable.group({
    authorName: [''],
    authorEmail: ['', [Validators.email]],
    body: ['', Validators.required],
  });

  readonly statusLabels: Record<TicketStatus, string> = {
    OPEN: 'Otwarte',
    IN_PROGRESS: 'W trakcie',
    RESOLVED: 'Rozwiązane',
    CLOSED: 'Zamknięte',
  };

  ngOnInit(): void {
    const user = this.auth.user();
    if (user) {
      this.commentForm.patchValue({
        authorName: `${user.firstName} ${user.lastName}`,
        authorEmail: user.email,
      });
    } else {
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
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Brak ID zgłoszenia');
      return;
    }
    this.reload(id);
  }

  private reload(id: string): void {
    this.api.getTicket(id).subscribe({
      next: (ticket) => this.applyTicket(ticket),
      error: () => this.error.set('Nie znaleziono zgłoszenia'),
    });
  }

  private applyTicket(ticket: Ticket): void {
    this.ticket.set(ticket);
    this.comments.set(ticket.comments ?? []);
    this.timeline.set(ticket.timeline ?? []);
    if (!this.auth.isLoggedIn() && !this.commentForm.controls.authorEmail.value && ticket.requesterEmail) {
      this.commentForm.controls.authorEmail.setValue(ticket.requesterEmail);
      this.commentForm.controls.authorName.setValue(ticket.requesterName);
    }
  }

  setStatus(status: TicketStatus): void {
    const current = this.ticket();
    if (!current) return;
    this.api.updateTicketStatus(current.id, status).subscribe({
      next: (ticket) => this.applyTicket(ticket),
    });
  }

  setAssignee(assigneeId: string): void {
    const current = this.ticket();
    if (!current) return;
    this.api.assignTicket(current.id, assigneeId || null).subscribe({
      next: (ticket) => this.applyTicket(ticket),
    });
  }

  groupMembers(ticket: Ticket): User[] {
    return (ticket.group?.members || [])
      .map((m) => m.user)
      .filter((u): u is User => Boolean(u));
  }

  submitComment(): void {
    const loggedIn = this.auth.isLoggedIn();
    if (!this.ticket()) return;

    if (!loggedIn) {
      this.commentForm.controls.authorEmail.addValidators([Validators.required, Validators.email]);
      this.commentForm.controls.authorEmail.updateValueAndValidity();
    }

    if (this.commentForm.controls.body.invalid || (!loggedIn && this.commentForm.controls.authorEmail.invalid)) {
      this.commentForm.markAllAsTouched();
      this.commentError.set(loggedIn ? 'Wpisz treść komentarza.' : 'Podaj e-mail i treść komentarza.');
      return;
    }

    this.commentSending.set(true);
    this.commentError.set(null);
    const value = this.commentForm.getRawValue();

    if (!loggedIn) {
      localStorage.setItem(
        COMMENT_DRAFT_KEY,
        JSON.stringify({
          authorName: value.authorName,
          authorEmail: value.authorEmail,
        })
      );
    }

    const payload = loggedIn
      ? { body: value.body.trim() }
      : {
          authorEmail: value.authorEmail.trim().toLowerCase(),
          authorName: value.authorName.trim() || undefined,
          body: value.body.trim(),
        };

    this.api.addComment(this.ticket()!.id, payload).subscribe({
      next: () => {
        this.commentForm.controls.body.setValue('');
        this.commentSending.set(false);
        this.reload(this.ticket()!.id);
      },
      error: () => {
        this.commentSending.set(false);
        this.commentError.set('Nie udało się dodać komentarza');
      },
    });
  }

  backLink(): string {
    if (this.auth.isAgent()) return '/helpdesk/dashboard';
    if (this.auth.isRequester()) return '/helpdesk/my';
    return '/helpdesk';
  }

  backLabel(): string {
    if (this.auth.isAgent()) return '← Dashboard';
    if (this.auth.isRequester()) return '← Moje zgłoszenia';
    return '← Helpdesk';
  }

  timelineDotClass(type: string): string {
    switch (type) {
      case 'CREATED':
        return 'bg-zinc-700';
      case 'STATUS_CHANGED':
        return 'bg-amber-500';
      case 'ASSIGNEE_CHANGED':
        return 'bg-sky-500';
      case 'COMMENT':
        return 'bg-emerald-500';
      default:
        return 'bg-zinc-400';
    }
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
