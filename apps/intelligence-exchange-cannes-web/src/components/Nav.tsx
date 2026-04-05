import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ShieldCheck, LogIn, LogOut, Loader2, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-600/20 text-blue-300 border border-blue-700/30'
        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
    }`;

  const navLinks = [
    { to: '/workspace', label: 'Workspace' },
    { to: '/submit', label: 'Post Idea' },
    { to: '/jobs', label: 'Jobs' },
    { to: '/agents', label: 'Agents' },
    { to: '/ideas', label: 'My Ideas' },
  ];

  const verifiedRoles = [
    isPosterVerified && 'Poster',
    isWorkerVerified && 'Worker',
  ].filter(Boolean) as string[];

  const roleLabel = verifiedRoles.length > 0 ? verifiedRoles.join(' + ') + ' verified' : null;

  return (
    <TooltipProvider>
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Brand + desktop nav links */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <NavLink to="/" className="text-white font-bold text-base tracking-tight hover:text-blue-400 transition-colors">
                Intelligence Exchange
              </NavLink>
              <Badge variant="info" className="hidden sm:inline-flex">Cannes 2026</Badge>
            </div>
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map(({ to, label }) => (
                <NavLink key={to} to={to} className={navLinkClass}>{label}</NavLink>
              ))}
            </div>
          </div>

          {/* Wallet + sign in/out + mobile menu */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Sign in / out — desktop */}
            {isConnected && (
              session ? (
                <Button variant="ghost" size="sm" onClick={signOut} className="hidden md:flex gap-1.5 text-gray-400">
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={signIn} disabled={isSessionLoading} className="hidden md:flex gap-1.5">
                  {isSessionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                  Sign In
                </Button>
              )
            )}

            <ConnectButton accountStatus="avatar" showBalance={false} chainStatus="icon" />

            {/* Mobile nav sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64 bg-slate-950 border-slate-800 p-0">
                <div className="flex flex-col h-full">
                  <div className="p-4 border-b border-slate-800">
                    <p className="text-sm font-semibold text-white">Intelligence Exchange</p>
                    {session?.accountAddress && (
                      <div className="flex items-center gap-2 mt-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs bg-gray-800 text-gray-300">
                            {session.accountAddress.slice(2, 4).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-gray-400 font-mono">
                          {session.accountAddress.slice(0, 6)}…{session.accountAddress.slice(-4)}
                        </span>
                      </div>
                    )}
                  </div>
                  <nav className="flex flex-col p-3 gap-1 flex-1">
                    {navLinks.map(({ to, label }) => (
                      <NavLink key={to} to={to} className={navLinkClass}>{label}</NavLink>
                    ))}
                  </nav>
                  {isConnected && (
                    <div className="p-4 border-t border-slate-800">
                      {session ? (
                        <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start gap-2 text-gray-400">
                          <LogOut className="w-3.5 h-3.5" />
                          Sign out
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={signIn} disabled={isSessionLoading} className="w-full gap-2">
                          {isSessionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                          Sign In
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Session / role status strip — shown below main bar when connected */}
        {isConnected && (
          <div className="hidden md:flex items-center gap-2 max-w-6xl mx-auto px-4 py-1 border-t border-slate-800/50">
            {isSessionLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />
            ) : session ? (
              <>
                <Badge variant="success" className="gap-1 text-xs">
                  <ShieldCheck className="w-3 h-3" /> Session
                </Badge>
                {demoMode && <Badge variant="warning" className="text-xs">Demo</Badge>}
                {roleLabel && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="info" className="cursor-default gap-1 text-xs">
                        <ShieldCheck className="w-3 h-3" />
                        Verified
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{roleLabel}</TooltipContent>
                  </Tooltip>
                )}
              </>
            ) : demoMode ? (
              <Badge variant="warning" className="text-xs">Demo</Badge>
            ) : null}
          </div>
        )}
      </nav>
    </TooltipProvider>
  );
}
