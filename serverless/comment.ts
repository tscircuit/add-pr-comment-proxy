import { HttpClient } from '@actions/http-client'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setCorsHeaders, handleCors } from './_cors'
import { checkToken } from './utils/github'

const GITHUB_API_URL = 'https://api.github.com'

interface GitHubError {
  statusCode?: number;
  message?: string;
  result?: any;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  console.log('Received request:', {
    method: req.method,
    url: req.url,
    headers: req.headers
  });
  
  // Handle CORS preflight
  if (handleCors(req, res)) return
  
  // Set CORS headers for actual request
  setCorsHeaders(res)

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const client = new HttpClient('add-pr-comment-proxy')

  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : req.body?.token;  // Fallback to body if not in header

  const { owner, repo, issueNumber, body } = req.body || {};

  // Add debug logging
  console.log('Parsed request:', { 
    hasToken: !!token, 
    owner, 
    repo, 
    issueNumber, 
    body, 
    tokenLength: token?.length 
  });

  // Validate token
  console.log('Attempting to validate token...');
  const isTokenValid = await checkToken(client, token)
  console.log('Token validation result:', isTokenValid);
  if (!isTokenValid) {
    return res.status(401).json({
      error: 'Invalid or missing GitHub token'
    })
  }

  if (!token || !owner || !repo || !issueNumber || !body) {
    return res.status(400).json({
      error: 'Missing required fields: token, owner, repo, issueNumber, body'
    })
  }

  try {
    console.log('Attempting to create comment:', {
      url: `${GITHUB_API_URL}/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      hasBody: !!body,
      tokenPrefix: token.substring(0, 4) // Log just the start of the token
    });
    
    const response = await client.postJson(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      { body },
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    )

    return res.status(200).json(response.result)
  } catch (error) {
    // Enhanced error logging with type casting
    const gitHubError = error as GitHubError
    console.error('Error details:', {
      status: gitHubError.statusCode,
      message: gitHubError.message,
      response: gitHubError.result
    })
    
    return res.status(gitHubError.statusCode || 500).json({ 
      error: 'Failed to post comment',
      details: gitHubError.result || gitHubError.message
    })
  }
} 