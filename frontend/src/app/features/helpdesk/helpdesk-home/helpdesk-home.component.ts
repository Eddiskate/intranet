import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpdeskApiService } from '../../../core/services/helpdesk-api.service';
import { TicketGroup } from '../../../core/models/helpdesk.models';

@Component({
  selector: 'app-helpdesk-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './helpdesk-home.component.html',
  styleUrl: './helpdesk-home.component.scss',
})
export class HelpdeskHomeComponent implements OnInit {
  private readonly api = inject(HelpdeskApiService);

  readonly groups = signal<TicketGroup[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.api.getGroups().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Nie udało się pobrać grup helpdesku. Uruchom API (port 3000).');
        this.loading.set(false);
      },
    });
  }

  memberNames(group: TicketGroup): string {
    return group.members
      .map((m) => `${m.user?.firstName ?? ''} ${m.user?.lastName ?? ''}`.trim())
      .filter(Boolean)
      .join(', ');
  }
}
