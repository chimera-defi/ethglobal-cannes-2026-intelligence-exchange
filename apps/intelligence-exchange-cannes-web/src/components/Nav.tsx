import { NavLink } from 'react-router-dom';
import { useBuyerSession } from '../session';
import { useState } from 'react';

export function Nav() {
  const { buyerId, setBuyerId } = useBuyerSession();
  const [draftBuyerId, setDraftBuyerId] = useState(buyerId);

  return (
    <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-lg tracking-tight">Intelligence Exchange</span>
          <span className="badge bg-blue-900 text-blue-300 text-xs">Cannes 2026</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <NavLink
            to="/buyer"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`
            }
          >
            Buyer
          </NavLink>
          <NavLink
            to="/buyer/review"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`
            }
          >
            Review
          </NavLink>
          <NavLink
            to="/buyer/history"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`
            }
          >
            History
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
            to="/buyer/new"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`
            }
          >
            Post Job
          </NavLink>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setBuyerId(draftBuyerId);
          }}
        >
          <label className="text-xs uppercase tracking-wide text-gray-500">Buyer Session</label>
          <input
            className="input !w-44 !py-1.5 !px-3 text-sm"
            value={draftBuyerId}
            onChange={(event) => setDraftBuyerId(event.target.value)}
            placeholder="wallet or buyer id"
          />
          <button className="btn-primary text-sm px-3 py-1.5" type="submit">
            Use
          </button>
          <span className="text-xs text-gray-500 hidden md:inline">Active: {buyerId}</span>
        </form>
      </div>
    </nav>
  );
}
