import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ShieldCheck, LogIn, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getIntegrationsStatus } from '../api';
import { useSession } from '../hooks/useSession';

export function Nav() {
  const {
    isConnected,
    session,
    isPosterVerified,
    isWorkerVerified,
    isSessionLoading,
    signIn,
    signOut,
  } = useSession();
  const { data: integrations } = useQuery({
    queryKey: ['integrations-status'],
    queryFn: getIntegrationsStatus,
    staleTime: 30_000,
  });
  const demoMode = integrations?.world.strict === false;

  const navLink = (to: string, label: string) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
        }`
      }
    >
      {label}
    </NavLink>
  );

  return (
    <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Brand + nav links */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <NavLink to="/" className="text-white font-bold text-base tracking-tight hover:text-blue-400 transition-colors">
              Intelligence Exchange
            </NavLink>
            <Badge variant="info" className="hidden sm:inline-flex">Cannes 2026</Badge>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {navLink('/workspace', 'Workspace')}
            {navLink('/submit', 'Post Idea')}
            {navLink('/jobs', 'Jobs')}
            {navLink('/ideas', 'My Ideas')}
          </div>
        </div>

        {/* Auth status + wallet */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Session status chips */}
          {isConnected && (
            <div className="hidden md:flex items-center gap-1.5">
              {isSessionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              ) : session ? (
                <>
                  <Badge variant="success" className="gap-1">
                    <ShieldCheck className="w-3 h-3" /> Session
                  </Badge>
                  {demoMode && (
                    <Badge variant="warning" className="gap-1">
                      Demo Mode
                    </Badge>
                  )}
                  {isPosterVerified && (
                    <Badge variant="info" className="gap-1">Poster</Badge>
                  )}
                  {isWorkerVerified && (
                    <Badge variant="info" className="gap-1">Worker</Badge>
                  )}
                </>
              ) : demoMode ? (
                <Badge variant="warning" className="gap-1">
                  Demo Mode
                </Badge>
              ) : null}
            </div>
          )}

          {/* Sign in / out */}
          {isConnected && (
            session ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="hidden md:flex gap-1.5 text-gray-400"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={signIn}
                disabled={isSessionLoading}
                className="hidden md:flex gap-1.5"
              >
                {isSessionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogIn className="w-3.5 h-3.5" />
                )}
                Sign In
              </Button>
            )
          )}

          <ConnectButton
            accountStatus="avatar"
            showBalance={false}
            chainStatus="icon"
          />
        </div>
      </div>
    </nav>
  );
}
