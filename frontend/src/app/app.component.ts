import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  readonly theme = inject(ThemeService);
  readonly auth = inject(AuthService);

  ngOnInit(): void {
    this.auth.restoreSession().subscribe();
  }

  logout(): void {
    this.auth.logout();
  }
}
