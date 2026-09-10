import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { HelpdeskApiService } from '../../../core/services/helpdesk-api.service';
import { Ticket, TicketStatus, User } from '../../../core/models/helpdesk.models';

@Component({
  selector: 'app-helpdesk-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './helpdesk-dashboard.component.html',
  styleUrl: './helpdesk-dashboard.component.scss',
})
export class HelpdeskDashboardComponent implements OnInit {
  private readonly api = inject(HelpdeskApiService);
  readonly auth = inject(AuthService);

  readonly tickets = signal<Ticket[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly statusFilter = signal<string>('');

  readonly statusLabels: Record<TicketStatus, string> = {
    OPEN: 'Otwarte',
    IN_PROGRESS: 'W trakcie',
    RESOLVED: 'Rozwiązane',
    CLOSED: 'Zamknięte',
  };

  ngOnInit(): void {
    this.loadTickets();
  }

  onStatusChange(status: string): void {
    this.statusFilter.set(status);
    this.loadTickets();
  }

  loadTickets(): void {
    this.loading.set(true);
    this.api
      .getTickets({
        status: this.statusFilter() || undefined,
      })
      .subscribe({
        next: (tickets) => {
          this.tickets.set(tickets);
          this.loading.set(false);
          this.error.set(null);
        },
        error: () => {
          this.error.set('Nie udało się pobrać zgłoszeń');
          this.loading.set(false);
        },
      });
  }

  setStatus(ticket: Ticket, status: TicketStatus): void {
    this.api.updateTicketStatus(ticket.id, status).subscribe({
      next: (updated) => this.replaceTicket(updated),
    });
  }

  setAssignee(ticket: Ticket, assigneeId: string): void {
    const value = assigneeId || null;
    this.api.assignTicket(ticket.id, value).subscribe({
      next: (updated) => this.replaceTicket(updated),
    });
  }

  groupMembers(ticket: Ticket): User[] {
    return (ticket.group?.members || [])
      .map((m) => m.user)
      .filter((u): u is User => Boolean(u));
  }

  private replaceTicket(updated: Ticket): void {
    this.tickets.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
  }

  groupLabel(user: User): string {
    return user.groups?.map((g) => g.group?.name).filter(Boolean).join(', ') || 'brak przypisań';
  }

  displayName(user: User): string {
    return `${user.firstName} ${user.lastName}`;
  }
}
