import { Link, NavLink } from 'react-router-dom';

const links: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/', label: 'Exchange', end: true },
  { to: '/submit', label: 'Buyer Console' },
  { to: '/jobs', label: 'Worker Queue' },
  { to: '/ideas', label: 'Posted Ideas' },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#090b10]/70 backdrop-blur-xl">
      <div className="app-grid flex min-h-20 items-center justify-between gap-4 py-4">
        <Link to="/" className="min-w-0">
          <p className="section-kicker text-[10px]">ETHGlobal Cannes 2026</p>
          <p className="brand-mark truncate text-2xl text-stone-50 md:text-3xl">Intelligence Exchange</p>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 md:flex">
          {links.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                [
                  'rounded-full px-4 py-2 text-sm font-medium transition-all duration-300',
                  isActive
                    ? 'bg-white/10 text-stone-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'text-stone-400 hover:text-stone-100',
                ].join(' ')
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-stone-400 lg:inline-flex">
            Desktop MVP
          </span>
          <Link to="/submit" className="btn-primary px-4 py-2.5 text-xs md:text-sm">
            Launch Brief
          </Link>
        </div>
      </div>

      <div className="app-grid pb-4 md:hidden">
        <nav className="flex gap-2 overflow-x-auto">
          {links.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                [
                  'whitespace-nowrap rounded-full border px-3 py-2 text-xs font-medium transition-all duration-300',
                  isActive
                    ? 'border-white/20 bg-white/10 text-stone-50'
                    : 'border-white/10 bg-white/5 text-stone-400',
                ].join(' ')
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
