import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateCommentPayload,
  CreateTicketPayload,
  Ticket,
  TicketComment,
  TicketGroup,
  TicketStatus,
  User,
  Worker,
} from '../models/helpdesk.models';

@Injectable({ providedIn: 'root' })
export class HelpdeskApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  getClientIp(): Observable<{ ip: string }> {
    return this.http.get<{ ip: string }>(`${this.base}/client-ip`);
  }

  getGroups(): Observable<TicketGroup[]> {
    return this.http.get<TicketGroup[]>(`${this.base}/groups`);
  }

  getGroup(idOrSlug: string): Observable<TicketGroup> {
    return this.http.get<TicketGroup>(`${this.base}/groups/${idOrSlug}`);
  }

  updateGroupMembers(groupId: string, userIds: string[]): Observable<TicketGroup> {
    return this.http.put<TicketGroup>(`${this.base}/groups/${groupId}/members`, { userIds });
  }

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.base}/users`);
  }

  getUserDepartments(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/users/departments`);
  }

  createUser(payload: {
    firstName: string;
    lastName: string;
    email: string;
    department: string;
    role?: string;
    groupIds?: string[];
  }): Observable<User> {
    return this.http.post<User>(`${this.base}/users`, payload);
  }

  updateUser(
    id: string,
    payload: {
      firstName: string;
      lastName: string;
      email: string;
      department: string;
      role?: string;
      groupIds?: string[];
    }
  ): Observable<User> {
    return this.http.put<User>(`${this.base}/users/${id}`, payload);
  }

  deleteUser(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/users/${id}`);
  }

  getOrganizationalUnits(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/tickets/meta/organizational-units`);
  }

  getTickets(filters?: {
    userId?: string;
    groupId?: string;
    status?: string;
  }): Observable<Ticket[]> {
    let params = new HttpParams();
    if (filters?.userId) params = params.set('userId', filters.userId);
    if (filters?.groupId) params = params.set('groupId', filters.groupId);
    if (filters?.status) params = params.set('status', filters.status);
    return this.http.get<Ticket[]>(`${this.base}/tickets`, { params });
  }

  getTicket(id: string): Observable<Ticket> {
    return this.http.get<Ticket>(`${this.base}/tickets/${id}`);
  }

  createTicket(payload: CreateTicketPayload): Observable<Ticket> {
    const form = new FormData();
    form.append('groupId', payload.groupId);
    form.append('requesterName', payload.requesterName);
    form.append('requesterEmail', payload.requesterEmail);
    form.append('organizationalUnit', payload.organizationalUnit);
    form.append('room', payload.room);
    form.append('phone', payload.phone);
    form.append('subject', payload.subject);
    form.append('body', payload.body);
    if (payload.computerIp) {
      form.append('computerIp', payload.computerIp);
    }
    payload.attachments?.forEach((file) => form.append('attachments', file));
    return this.http.post<Ticket>(`${this.base}/tickets`, form);
  }

  updateTicketStatus(id: string, status: TicketStatus): Observable<Ticket> {
    return this.http.patch<Ticket>(`${this.base}/tickets/${id}/status`, { status });
  }

  assignTicket(id: string, assigneeId: string | null): Observable<Ticket> {
    return this.http.patch<Ticket>(`${this.base}/tickets/${id}/assignee`, { assigneeId });
  }

  getComments(ticketId: string): Observable<TicketComment[]> {
    return this.http.get<TicketComment[]>(`${this.base}/tickets/${ticketId}/comments`);
  }

  addComment(ticketId: string, payload: CreateCommentPayload): Observable<TicketComment> {
    return this.http.post<TicketComment>(`${this.base}/tickets/${ticketId}/comments`, payload);
  }

  getWorkers(): Observable<Worker[]> {
    return this.http.get<Worker[]>(`${this.base}/workers`);
  }
}
