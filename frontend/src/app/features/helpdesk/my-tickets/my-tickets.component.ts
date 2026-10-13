import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { HelpdeskApiService } from '../../../core/services/helpdesk-api.service';
import { Ticket, TicketStatus } from '../../../core/models/helpdesk.models';

@Component({
  selector: 'app-my-tickets',
  standalone: true,
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './my-tickets.component.html',
  styleUrl: './my-tickets.component.scss',
})
export class MyTicketsComponent implements OnInit {
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
          this.error.set('Nie udało się pobrać Twoich zgłoszeń');
          this.loading.set(false);
        },
      });
  }
}
