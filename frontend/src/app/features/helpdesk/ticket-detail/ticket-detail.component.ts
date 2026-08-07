import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HelpdeskApiService } from '../../../core/services/helpdesk-api.service';
import { Ticket, TicketStatus } from '../../../core/models/helpdesk.models';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe, FormsModule],
  templateUrl: './ticket-detail.component.html',
  styleUrl: './ticket-detail.component.scss',
})
export class TicketDetailComponent implements OnInit {
  private readonly api = inject(HelpdeskApiService);
  private readonly route = inject(ActivatedRoute);

  readonly ticket = signal<Ticket | null>(null);
  readonly error = signal<string | null>(null);

  readonly statusLabels: Record<TicketStatus, string> = {
    OPEN: 'Otwarte',
    IN_PROGRESS: 'W trakcie',
    RESOLVED: 'Rozwiązane',
    CLOSED: 'Zamknięte',
  };

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Brak ID zgłoszenia');
      return;
    }
    this.api.getTicket(id).subscribe({
      next: (ticket) => this.ticket.set(ticket),
      error: () => this.error.set('Nie znaleziono zgłoszenia'),
    });
  }

  setStatus(status: TicketStatus): void {
    const current = this.ticket();
    if (!current) return;
    this.api.updateTicketStatus(current.id, status).subscribe({
      next: (ticket) => this.ticket.set(ticket),
    });
  }
}
