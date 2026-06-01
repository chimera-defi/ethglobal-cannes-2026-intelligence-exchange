import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { GITHUB_ENABLED, exchangeCodeForToken, getUserRepos, getRepoContext, createPR, createGitHubSession, getGitHubSession } from '../services/githubService';

export const githubRouter = new Hono();

// GitHub OAuth redirect
githubRouter.get('/auth', (c) => {
  if (!GITHUB_ENABLED) {
    return c.json({ error: { code: 'GITHUB_DISABLED', message: 'GitHub integration is not enabled' } }, 501);
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: { code: 'GITHUB_NOT_CONFIGURED', message: 'GITHUB_CLIENT_ID not set' } }, 500);
  }

  const redirectUri = `${process.env.BROKER_URL}/v1/cannes/github/callback`;
  const scope = 'repo,read:user';
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  
  return c.redirect(authUrl);
});

// GitHub OAuth callback
githubRouter.get('/callback', zValidator('query', z.object({
  code: z.string(),
})), async (c) => {
  if (!GITHUB_ENABLED) {
    return c.json({ error: { code: 'GITHUB_DISABLED', message: 'GitHub integration is not enabled' } }, 501);
  }

  const { code } = c.req.valid('query');

  try {
    const token = await exchangeCodeForToken(code);
    
    // Fetch username to return to client
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch GitHub user');
    }

    const user = await userResponse.json() as { login: string };
    const username = user.login;

    const sessionToken = createGitHubSession(token, username);

    return c.json({
      sessionToken,
      username,
    });
  } catch (error) {
    console.error('[github:callback]', error);
    return c.json({ 
      error: { 
        code: 'GITHUB_AUTH_FAILED', 
        message: error instanceof Error ? error.message : 'GitHub authentication failed' 
      } 
    }, 500);
  }
});

// Get user repositories
githubRouter.get('/repos', async (c) => {
  if (!GITHUB_ENABLED) {
    return c.json({ error: { code: 'GITHUB_DISABLED', message: 'GitHub integration is not enabled' } }, 501);
  }

  const sessionToken = c.req.header('X-GitHub-Session');
  if (!sessionToken) {
    return c.json({ error: { code: 'MISSING_SESSION', message: 'X-GitHub-Session header required' } }, 401);
  }

  const session = await getGitHubSession(sessionToken);
  if (!session) {
    return c.json({ error: { code: 'INVALID_SESSION', message: 'Invalid or expired session' } }, 401);
  }

  try {
    const repos = await getUserRepos(session.token);
    return c.json({ repos });
  } catch (error) {
    console.error('[github:repos]', error);
    return c.json({ 
      error: { 
        code: 'GITHUB_API_ERROR', 
        message: error instanceof Error ? error.message : 'Failed to fetch repositories' 
      } 
    }, 500);
  }
});

// Get repository context
githubRouter.get('/repos/:fullName/context', async (c) => {
  if (!GITHUB_ENABLED) {
    return c.json({ error: { code: 'GITHUB_DISABLED', message: 'GitHub integration is not enabled' } }, 501);
  }

  const sessionToken = c.req.header('X-GitHub-Session');
  if (!sessionToken) {
    return c.json({ error: { code: 'MISSING_SESSION', message: 'X-GitHub-Session header required' } }, 401);
  }

  const session = await getGitHubSession(sessionToken);
  if (!session) {
    return c.json({ error: { code: 'INVALID_SESSION', message: 'Invalid or expired session' } }, 401);
  }

  const fullName = c.req.param('fullName');
  if (!fullName) {
    return c.json({ error: { code: 'INVALID_REPO', message: 'Repository full name required' } }, 400);
  }

  try {
    const context = await getRepoContext(session.token, fullName);
    return c.json(context);
  } catch (error) {
    console.error('[github:context]', error);
    return c.json({ 
      error: { 
        code: 'GITHUB_API_ERROR', 
        message: error instanceof Error ? error.message : 'Failed to fetch repository context' 
      } 
    }, 500);
  }
});

// Create pull request
githubRouter.post('/create-pr', zValidator('json', z.object({
  sessionToken: z.string(),
  repoFullName: z.string(),
  title: z.string(),
  body: z.string(),
  head: z.string().optional(),
  base: z.string().optional(),
})), async (c) => {
  if (!GITHUB_ENABLED) {
    return c.json({ error: { code: 'GITHUB_DISABLED', message: 'GitHub integration is not enabled' } }, 501);
  }

  const req = c.req.valid('json');
  const session = await getGitHubSession(req.sessionToken);
  if (!session) {
    return c.json({ error: { code: 'INVALID_SESSION', message: 'Invalid or expired session' } }, 401);
  }

  try {
    const pr = await createPR(
      session.token,
      req.repoFullName,
      {
        title: req.title,
        body: req.body,
        head: req.head || 'main',
        base: req.base || 'main',
      }
    );
    
    return c.json({
      url: pr.url,
      number: pr.number,
    });
  } catch (error) {
    console.error('[github:create-pr]', error);
    return c.json({ 
      error: { 
        code: 'GITHUB_API_ERROR', 
        message: error instanceof Error ? error.message : 'Failed to create pull request' 
      } 
    }, 500);
  }
});