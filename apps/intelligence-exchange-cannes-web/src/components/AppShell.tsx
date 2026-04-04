import { Outlet } from 'react-router-dom';
import { Nav } from './Nav';

export function AppShell() {
  return (
    <div className="app-shell">
      <Nav />
      <main className="relative z-10 pb-16 md:pb-20">
        <Outlet />
      </main>
    </div>
  );
}
