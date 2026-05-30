import { Redis } from 'ioredis';

export const GITHUB_ENABLED = Boolean(process.env.GITHUB_CLIENT_ID);

// Lazy Redis client singleton for GitHub token storage
let redisClient: Redis | null = null;
let redisAvailable = true;

function getRedis(): Redis | null {
  if (!redisAvailable) return null;

  if (redisClient) return redisClient;

  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          redisAvailable = false;
          console.warn('[githubService] Redis unavailable, falling back to in-memory storage');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });
    redisClient.on('error', () => {
      redisAvailable = false;
      console.warn('[githubService] Redis error, falling back to in-memory storage');
    });
    return redisClient;
  } catch (err) {
    redisAvailable = false;
    console.warn('[githubService] Redis initialization failed, falling back to in-memory storage:', err);
    return null;
  }
}

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
  // SSRF protection: validate repo name format
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(fullName)) {
    throw new Error('Invalid repo name format');
  }

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

// GitHub session storage with Redis backend (1-hour TTL) and in-memory fallback
const SESSION_TTL_SECONDS = 3600; // 1 hour

// In-memory fallback store
const githubSessionsFallback = new Map<string, { token: string; username: string; createdAt: number }>();

export async function createGitHubSession(token: string, username: string): Promise<string> {
  const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const redis = getRedis();

  if (redis) {
    try {
      await redis.setex(`github_token:${sessionToken}`, SESSION_TTL_SECONDS, JSON.stringify({ token, username }));
    } catch (err) {
      console.warn('[githubService] Redis set failed, using in-memory fallback:', err);
      githubSessionsFallback.set(sessionToken, { token, username, createdAt: Date.now() });
    }
  } else {
    githubSessionsFallback.set(sessionToken, { token, username, createdAt: Date.now() });
  }

  return sessionToken;
}

export async function getGitHubSession(sessionToken: string): Promise<{ token: string; username: string } | null> {
  const redis = getRedis();

  if (redis) {
    try {
      const data = await redis.get(`github_token:${sessionToken}`);
      if (data) {
        return JSON.parse(data);
      }
    } catch (err) {
      console.warn('[githubService] Redis get failed, checking in-memory fallback:', err);
    }
  }

  // In-memory fallback
  const session = githubSessionsFallback.get(sessionToken);
  if (!session) return null;

  // Check expiration (1 hour)
  if (Date.now() - session.createdAt > SESSION_TTL_SECONDS * 1000) {
    githubSessionsFallback.delete(sessionToken);
    return null;
  }

  return { token: session.token, username: session.username };
}

export async function deleteGitHubSession(sessionToken: string): Promise<void> {
  const redis = getRedis();

  if (redis) {
    try {
      await redis.del(`github_token:${sessionToken}`);
    } catch (err) {
      console.warn('[githubService] Redis del failed, using in-memory fallback:', err);
    }
  }

  githubSessionsFallback.delete(sessionToken);
}