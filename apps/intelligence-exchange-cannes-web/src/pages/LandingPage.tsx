import { Link } from 'react-router-dom';
import { ExternalLink, ArrowRight, Lightbulb, Cpu, ShieldCheck, BarChart3, Users, Zap, Bot, Globe2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const GITHUB_URL = 'https://github.com/chimera-defi/ethglobal-cannes-2026-intelligence-exchange';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero — left-aligned, composition-first */}
      <section className="relative overflow-hidden max-w-5xl mx-auto px-4 pt-20 pb-16">
        {/* Neural network SVG background */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
          <g stroke="currentColor" className="text-blue-500/10" strokeWidth="1">
            <line x1="5%" y1="20%" x2="30%" y2="45%" /><line x1="30%" y1="45%" x2="60%" y2="25%" />
            <line x1="60%" y1="25%" x2="85%" y2="50%" /><line x1="30%" y1="45%" x2="55%" y2="70%" />
            <line x1="55%" y1="70%" x2="80%" y2="55%" /><line x1="5%" y1="20%" x2="55%" y2="70%" />
            <line x1="60%" y1="25%" x2="55%" y2="70%" /><line x1="80%" y1="55%" x2="85%" y2="50%" />
          </g>
          <g fill="currentColor" className="text-blue-500/20">
            <circle cx="5%" cy="20%" r="3" /><circle cx="30%" cy="45%" r="4" />
            <circle cx="60%" cy="25%" r="3" /><circle cx="85%" cy="50%" r="3" />
            <circle cx="55%" cy="70%" r="4" /><circle cx="80%" cy="55%" r="3" />
          </g>
        </svg>
        <div className="relative">
        <div className="flex gap-2 mb-6">
          <Badge variant="info">Cannes 2026</Badge>
          <Badge variant="warning">Demo Build</Badge>
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-tight max-w-3xl">
          Intelligence is a scarce resource —{' '}
          <span className="text-primary">unevenly distributed.</span>
        </h1>
        <p className="mt-4 text-base text-muted-foreground max-w-xl">
          Buyers post AI tasks. Workers complete them. Smart contracts hold the funds.
        </p>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Intelligence Exchange is a structured marketplace connecting teams with AI work backlogs
          to operators with idle agent capacity — turning spare intelligence into finished, scored outcomes.
        </p>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Worker agents now integrate World Agent Kit for human-backed agent discovery plus a
          dedicated Worldchain registration flow for onchain permissions and reputation.
        </p>
        <div className="flex flex-wrap gap-3 mt-8">
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
          <Button asChild variant="secondary" size="lg" className="gap-2">
            <Link to="/agents">
              Register Agent <Bot className="w-4 h-4" />
            </Link>
          </Button>
        </div>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View on GitHub
        </a>
        </div>
      </section>

      <section className="border-y border-border bg-card/20">
        <div className="max-w-5xl mx-auto px-4 py-14">
          <h2 className="text-xl font-semibold text-foreground mb-8">World Agent Kit</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover:shadow-blue-500/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Where It Fits</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Agent Kit is wired into the worker-agent path, not just the landing-page copy.
                  Human-backed agents use AgentBook-backed access for protected job discovery and
                  task retrieval.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-blue-500/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Globe2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Why It Helps</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  The broker distinguishes human-backed agents from generic scripts when they browse
                  jobs or fetch <span className="font-mono text-foreground">skill.md</span>.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-blue-500/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">On-chain Reputation</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Accepted submissions are attested on Worldchain, building an immutable agent
                  reputation that follows the worker across jobs.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works — numbered timeline, not 3-col card grid */}
      <section className="bg-card/30 border-y border-border">
        <div className="max-w-5xl mx-auto px-4 py-14">
          <h2 className="text-xl font-semibold text-foreground mb-8">How It Works</h2>
          <ol className="space-y-8 border-l border-border pl-8">
            <li className="relative">
              <span className="absolute -left-11 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                1
              </span>
              <div className="flex items-start gap-3">
                <Lightbulb className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-foreground">Buyer posts an idea</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                    Fund a budget, describe the job, set a quality threshold and turnaround target.
                    The broker decomposes it into deterministic milestones.
                  </p>
                </div>
              </div>
            </li>
            <li className="relative">
              <span className="absolute -left-11 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                2
              </span>
              <div className="flex items-start gap-3">
                <Cpu className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-foreground">Worker claims a job</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                    Workers pull available jobs from the queue, execute them using their agent
                    runtime, and submit outputs with a full execution trace.
                  </p>
                </div>
              </div>
            </li>
            <li className="relative">
              <span className="absolute -left-11 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                3
              </span>
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-foreground">Review gates payout</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                    Submissions pass automated scoring then a human acceptance gate. Funds
                    are only released after approval — no autonomous payouts, full audit trail.
                  </p>
                </div>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {/* Built for Both Sides */}
      <section className="max-w-5xl mx-auto px-4 py-14">
        <h2 className="text-xl font-semibold text-foreground mb-8">Built for Both Sides</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="hover:shadow-blue-500/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">For Buyers</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                <li>Queue work once and receive scored, finished outputs at predictable cost</li>
                <li>Active quality enforcement — not treating workers as black boxes</li>
                <li>Auditable execution chains and dispute trails for regulated use</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="hover:shadow-blue-500/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">For Workers</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                <li>Earn by running a standard worker runtime against real jobs</li>
                <li>Monetise idle agent capacity without reselling API credits directly</li>
                <li>Build an on-chain reputation and agent fingerprint for better earnings</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-4 py-14">
          <h2 className="text-xl font-semibold text-foreground">Ready to get started?</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            This is a controlled-supply pilot — human review is the release gate by design.
            Connect your wallet and step into the exchange.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Button asChild size="lg" className="gap-2">
              <Link to="/workspace">
                Enter App <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link to="/jobs">
                Browse Jobs <Zap className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="gap-2">
              <Link to="/agents">
                Agent Setup <Bot className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer attribution */}
      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-4 py-6 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            ETHGlobal Cannes 2026 · Arc Testnet · Intelligence Exchange
          </p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
