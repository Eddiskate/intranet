import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HelpdeskApiService } from '../../../core/services/helpdesk-api.service';
import { SessionService } from '../../../core/services/session.service';
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
  readonly session = inject(SessionService);

  readonly tickets = signal<Ticket[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly statusFilter = signal<string>('');

  readonly agentUsers = computed(() =>
    this.session.allUsers().filter((u) => u.role === 'AGENT' || u.role === 'ADMIN')
  );

  readonly statusLabels: Record<TicketStatus, string> = {
    OPEN: 'Otwarte',
    IN_PROGRESS: 'W trakcie',
    RESOLVED: 'Rozwiązane',
    CLOSED: 'Zamknięte',
  };

  ngOnInit(): void {
    this.api.getUsers().subscribe({
      next: (users) => {
        this.session.setUsers(users);
        this.loadTickets();
      },
      error: () => {
        this.error.set('Nie udało się pobrać użytkowników');
        this.loading.set(false);
      },
    });
  }

  onUserChange(userId: string): void {
    this.session.setUser(userId);
    this.loadTickets();
  }

  onStatusChange(status: string): void {
    this.statusFilter.set(status);
    this.loadTickets();
  }

  loadTickets(): void {
    const userId = this.session.userId();
    if (!userId) {
      this.tickets.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.api
      .getTickets({
        userId,
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
      next: (updated) => {
        this.tickets.update((list) =>
          list.map((t) => (t.id === updated.id ? updated : t))
        );
      },
    });
  }

  groupLabel(user: User): string {
    return user.groups?.map((g) => g.group?.name).filter(Boolean).join(', ') || 'brak przypisań';
  }

  displayName(user: User): string {
    return `${user.firstName} ${user.lastName}`;
  }
}
