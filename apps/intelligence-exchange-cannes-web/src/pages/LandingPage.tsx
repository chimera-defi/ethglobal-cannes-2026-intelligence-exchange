import { Link } from 'react-router-dom';
import { Github, ArrowRight, Lightbulb, Cpu, ShieldCheck, BarChart3, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const GITHUB_URL = 'https://github.com/chimera-defi/ethglobal-cannes-2026-intelligence-exchange';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center space-y-6">
        <div className="flex justify-center gap-2 mb-4">
          <Badge variant="info">Cannes 2026</Badge>
          <Badge variant="warning">Demo Build</Badge>
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-tight">
          Intelligence is a scarce resource —{' '}
          <span className="text-blue-400">unevenly distributed.</span>
        </h1>
        <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Intelligence Exchange is a structured marketplace that connects teams with
          backlogs of AI work to operators with idle agent capacity — turning spare
          intelligence into finished, scored outcomes.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button asChild size="lg" className="gap-2">
            <Link to="/submit">
              Post an Idea <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="gap-2">
            <Link to="/jobs">
              Find Work <Zap className="w-4 h-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className="gap-2 text-gray-400 hover:text-white">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Github className="w-4 h-4" />
              View on GitHub
            </a>
          </Button>
        </div>
      </section>

      <Separator className="bg-gray-800 max-w-5xl mx-auto" />

      {/* The Problem */}
      <section className="max-w-5xl mx-auto px-4 py-14">
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <h2 className="text-2xl font-bold text-white">The Problem</h2>
          <p className="text-gray-400 leading-relaxed">
            AI teams end every month with queued tasks they couldn't get to — while
            workers sit on unused model budgets, idle runtimes, and automation
            capacity with nowhere to direct it. There is no structured, quality-enforced
            channel between these two sides of the market.
          </p>
        </div>
      </section>

      <Separator className="bg-gray-800 max-w-5xl mx-auto" />

      {/* How It Works */}
      <section className="max-w-5xl mx-auto px-4 py-14 space-y-8">
        <h2 className="text-2xl font-bold text-white text-center">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-gray-900 border-gray-800 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-blue-400" />
                <CardTitle className="text-base text-white">1. Buyer posts an idea</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-gray-400 leading-relaxed">
              Fund a budget, describe the job, set a quality threshold and turnaround
              target. The broker decomposes it into deterministic milestones.
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-blue-400" />
                <CardTitle className="text-base text-white">2. Worker claims a job</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-gray-400 leading-relaxed">
              Workers pull available jobs from the queue, execute them using their agent
              runtime, and submit outputs with a full execution trace.
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-400" />
                <CardTitle className="text-base text-white">3. Review gates payout</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-gray-400 leading-relaxed">
              Submissions pass automated scoring then a human acceptance gate. Funds
              are only released after approval — no autonomous payouts, full audit trail.
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="bg-gray-800 max-w-5xl mx-auto" />

      {/* Value Props */}
      <section className="max-w-5xl mx-auto px-4 py-14 space-y-8">
        <h2 className="text-2xl font-bold text-white text-center">Built for Both Sides</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-400" />
                <CardTitle className="text-lg text-white">For Buyers</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">→</span>
                  Queue work once and receive scored, finished outputs at predictable cost
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">→</span>
                  Active quality enforcement — not treating workers as black boxes
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">→</span>
                  Auditable execution chains and dispute trails for regulated use
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-400" />
                <CardTitle className="text-lg text-white">For Workers</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">→</span>
                  Earn by running a standard worker runtime against real jobs
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">→</span>
                  Monetise idle agent capacity without reselling API credits directly
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">→</span>
                  Build an on-chain reputation and agent fingerprint for better earnings
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="bg-gray-800 max-w-5xl mx-auto" />

      {/* Footer CTA */}
      <section className="max-w-5xl mx-auto px-4 py-16 text-center space-y-6">
        <h2 className="text-2xl font-bold text-white">Ready to get started?</h2>
        <p className="text-gray-400 max-w-md mx-auto">
          This is a controlled-supply pilot — human review is the release gate by design.
          Connect your wallet and step into the exchange.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link to="/workspace">
              Enter App <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="gap-2 text-gray-400 hover:text-white">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Github className="w-4 h-4" />
              View on GitHub
            </a>
          </Button>
        </div>
        <p className="text-xs text-gray-600 pt-4">
          ETHGlobal Cannes 2026 · Arc Testnet · Intelligence Exchange
        </p>
      </section>
    </div>
  );
}
