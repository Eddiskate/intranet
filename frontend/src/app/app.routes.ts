import { Routes } from '@angular/router';
import { HelpdeskHomeComponent } from './features/helpdesk/helpdesk-home/helpdesk-home.component';
import { TicketFormComponent } from './features/helpdesk/ticket-form/ticket-form.component';
import { HelpdeskDashboardComponent } from './features/helpdesk/helpdesk-dashboard/helpdesk-dashboard.component';
import { UsersAdminComponent } from './features/helpdesk/users-admin/users-admin.component';
import { TicketDetailComponent } from './features/helpdesk/ticket-detail/ticket-detail.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'helpdesk' },
  { path: 'helpdesk', component: HelpdeskHomeComponent },
  { path: 'helpdesk/new/:groupSlug', component: TicketFormComponent },
  { path: 'helpdesk/dashboard', component: HelpdeskDashboardComponent },
  { path: 'helpdesk/users', component: UsersAdminComponent },
  { path: 'helpdesk/tickets/:id', component: TicketDetailComponent },
  { path: '**', redirectTo: 'helpdesk' },
];
