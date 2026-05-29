export const GITHUB_ENABLED = Boolean(process.env.GITHUB_CLIENT_ID);

interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  private: boolean;
}

interface GitHubUser {
  login: string;
}

interface GitHubCreatePRResponse {
  html_url: string;
  number: number;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub token exchange failed: ${error}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`GitHub token exchange error: ${data.error_description || data.error}`);
  }

  return data.access_token;
}

export async function getUserRepos(token: string): Promise<Array<{
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  defaultBranch: string;
  isPrivate: boolean;
}>> {
  const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=50', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub repos fetch failed: ${error}`);
  }

  const repos: GitHubRepo[] = await response.json();
  return repos.map(repo => ({
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    url: repo.html_url,
    defaultBranch: repo.default_branch,
    isPrivate: repo.private,
  }));
}

export async function getRepoContext(token: string, fullName: string): Promise<{
  readme?: string;
  topFiles: string[];
}> {
  const [readmeResponse, contentsResponse] = await Promise.all([
    fetch(`https://api.github.com/repos/${fullName}/readme`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    }),
    fetch(`https://api.github.com/repos/${fullName}/contents/`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    }),
  ]);

  let readme: string | undefined;
  if (readmeResponse.ok) {
    const readmeData = await readmeResponse.json();
    if (readmeData.content) {
      readme = Buffer.from(readmeData.content, 'base64').toString('utf-8');
    }
  }

  let topFiles: string[] = [];
  if (contentsResponse.ok) {
    const contentsData = await contentsResponse.json();
    topFiles = contentsData
      .filter((item: any) => item.type === 'file')
      .map((item: any) => item.name)
      .slice(0, 20); // Limit to top 20 files
  }

  return { readme, topFiles };
}

export async function createPR(
  token: string,
  repoFullName: string,
  opts: { title: string; body: string; head: string; base: string }
): Promise<{ url: string; number: number }> {
  const response = await fetch(`https://api.github.com/repos/${repoFullName}/pulls`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: opts.title,
      body: opts.body,
      head: opts.head,
      base: opts.base,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub PR creation failed: ${error}`);
  }

  const pr: GitHubCreatePRResponse = await response.json();
  return {
    url: pr.html_url,
    number: pr.number,
  };
}

// Simple in-memory session store (for development; use Redis in production)
const githubSessions = new Map<string, { token: string; username: string; createdAt: number }>();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createGitHubSession(token: string, username: string): string {
  const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
  githubSessions.set(sessionToken, {
    token,
    username,
    createdAt: Date.now(),
  });
  return sessionToken;
}

export function getGitHubSession(sessionToken: string): { token: string; username: string } | null {
  const session = githubSessions.get(sessionToken);
  if (!session) return null;
  
  // Check expiration
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    githubSessions.delete(sessionToken);
    return null;
  }
  
  return { token: session.token, username: session.username };
}

export function deleteGitHubSession(sessionToken: string): void {
  githubSessions.delete(sessionToken);
}