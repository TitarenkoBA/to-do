import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'today' },
  { path: 'today', title: 'Сегодня · Ритм', loadComponent: () => import('./pages/today').then((m) => m.Today) },
  { path: 'tasks', title: 'Задачи · Ритм', loadComponent: () => import('./pages/tasks').then((m) => m.Tasks) },
  { path: 'calendar', title: 'Календарь · Ритм', loadComponent: () => import('./pages/calendar').then((m) => m.CalendarPage) },
  { path: 'notes', title: 'Заметки · Ритм', loadComponent: () => import('./pages/notes').then((m) => m.Notes) },
  { path: 'notes/:id', title: 'Заметка · Ритм', loadComponent: () => import('./pages/notes').then((m) => m.NoteEditor) },
  { path: 'journal', title: 'Дневник · Ритм', loadComponent: () => import('./pages/journal').then((m) => m.Journal) },
  { path: 'journal/:id', title: 'Дневник · Ритм', loadComponent: () => import('./pages/journal').then((m) => m.JournalEditor) },
  { path: 'habits', title: 'Привычки · Ритм', loadComponent: () => import('./pages/habits').then((m) => m.Habits) },
  { path: 'focus', title: 'Фокус · Ритм', loadComponent: () => import('./pages/focus').then((m) => m.Focus) },
  { path: 'alarms', title: 'Будильники · Ритм', loadComponent: () => import('./pages/alarms').then((m) => m.Alarms) },
  { path: 'settings', title: 'Настройки · Ритм', loadComponent: () => import('./pages/settings').then((m) => m.SettingsPage) },
  { path: 'more', title: 'Ритм', loadComponent: () => import('./pages/more').then((m) => m.More) },
  { path: '**', redirectTo: 'today' },
];
