import { HttpClient } from '@actions/http-client'

export async function checkToken(http: HttpClient, token: string): Promise<boolean> {
  if (!token) {
    console.log('Token is missing');
    return false;
  }

  try {
    // First try to get user info to validate PAT
    const userResponse = await http.getJson('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    
    // If we get here, it's a valid PAT
    console.log('Token validated as Personal Access Token');
    return true;
  } catch (err: any) {
    // Check if it's a temporary token
    if (err.statusCode === 403 && 
        err.result?.message?.startsWith('Resource not accessible by integration')) {
      console.log('Token validated as GitHub Actions temporary token');
      return true;
    }
    
    console.log('Token validation failed:', err.message);
    return false;
  }
} 