import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GitBranch as Github, Loader2, X } from 'lucide-react';

interface Repo {
  fullName: string;
  description: string;
  url: string;
  defaultBranch: string;
}

interface GitHubRepoPickerProps {
  onRepoSelected: (repo: { fullName: string; description: string; url: string; defaultBranch: string }) => void;
}

const GITHUB_AUTH_URL = '/v1/cannes/github/auth';
const GITHUB_REPOS_URL = '/v1/cannes/github/repos';

export function GitHubRepoPicker({ onRepoSelected }: GitHubRepoPickerProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [, setToken] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('github_session');
    if (storedToken) {
      setToken(storedToken);
      setIsAuthenticated(true);
      fetchRepos(storedToken);
    }

    const params = new URLSearchParams(window.location.search);
    const githubSession = params.get('github_session');
    const username = params.get('username');
    if (githubSession && username) {
      localStorage.setItem('github_session', githubSession);
      setToken(githubSession);
      setIsAuthenticated(true);
      window.history.replaceState({}, '', window.location.pathname);
      fetchRepos(githubSession);
    }
  }, []);

  async function fetchRepos(authToken: string) {
    setLoading(true);
    try {
      const res = await fetch(GITHUB_REPOS_URL, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRepos(data.repos || []);
      }
    } catch (err) {
      console.error('Failed to fetch repos:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleConnect() {
    window.location.href = GITHUB_AUTH_URL;
  }

  function handleDisconnect() {
    localStorage.removeItem('github_session');
    setToken(null);
    setIsAuthenticated(false);
    setRepos([]);
    setSelectedRepo(null);
  }

  const filteredRepos = repos.filter(repo =>
    repo.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (selectedRepo) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between p-3 bg-[#0D1625] border border-[#1E2D42] rounded-lg">
          <div className="flex items-center gap-2">
            <Github className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-200">{selectedRepo.fullName}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedRepo(null);
              onRepoSelected({ fullName: '', description: '', url: '', defaultBranch: '' });
            }}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!isAuthenticated ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleConnect}
        >
          <Github className="w-4 h-4 mr-2" />
          Connect GitHub
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Link a GitHub repo (optional)</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-gray-400 hover:text-gray-200"
              onClick={handleDisconnect}
            >
              Disconnect
            </Button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center p-4 bg-[#0D1625] border border-[#1E2D42] rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-[#0D1625] border-[#1E2D42] text-gray-200"
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredRepos.slice(0, 10).map(repo => (
                  <button
                    key={repo.fullName}
                    type="button"
                    onClick={() => {
                      setSelectedRepo(repo);
                      onRepoSelected(repo);
                    }}
                    className="w-full text-left p-2 bg-[#0D1625] border border-[#1E2D42] rounded hover:bg-[#131F32] hover:border-[#3B82F6] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Github className="w-3 h-3 text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-200 truncate">{repo.fullName}</span>
                    </div>
                    {repo.description && (
                      <p className="text-xs text-gray-500 truncate mt-1">{repo.description}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}