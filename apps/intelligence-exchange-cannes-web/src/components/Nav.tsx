import { NavLink } from 'react-router-dom';

export function Nav() {
  return (
    <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-lg tracking-tight">Intelligence Exchange</span>
          <span className="badge bg-blue-900 text-blue-300 text-xs">Cannes 2026</span>
        </div>
        <div className="flex items-center gap-1">
          <NavLink
            to="/submit"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`
            }
          >
            Post Idea
          </NavLink>
          <NavLink
            to="/jobs"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`
            }
          >
            Jobs Board
          </NavLink>
          <NavLink
            to="/ideas"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`
            }
          >
            My Ideas
          </NavLink>
        </div>
      </div>
    </nav>
  );
}
