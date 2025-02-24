import { HttpClient } from '@actions/http-client'

const createOrUpdateComment = async (http, params) => {
  const { repoToken, owner, repo, issueNumber, body } = params

  // Fetch existing comments
  const commentsResponse = await http.getJson(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {
      accept: 'application/vnd.github.v3+json',
      authorization: `token ${repoToken}`,
    }
  )

  // Check if a comment already exists
  const existingComment = commentsResponse.result.find(comment =>
    comment.user.login === "tscircuitbot"
  )


  if (existingComment) {
    // Update the existing comment
    return http.patchJson(
      `https://api.github.com/repos/${owner}/${repo}/issues/comments/${existingComment.id}`,
      { body },
      {
        accept: 'application/vnd.github.v3+json',
        authorization: `token ${repoToken}`,
      }
    )
  } else {
    // Create a new comment if no existing one is found
    return http.postJson(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      { body },
      {
        accept: 'application/vnd.github.v3+json',
        authorization: `token ${repoToken}`,
      }
    )
  }
}

const checkToken = async (http, token) => {
  if (!token) {
    return false
  }

  if (token === process.env.GITHUB_TOKEN) {
    // Assume the use of this token is intentional
    return true
  }

  try {
    await http.getJson(`https://api.github.com/user/repos`, {
      accept: 'application/vnd.github.v3+json',
      authorization: `token ${token}`,
    })
    return false
  } catch (err) {
    // Far from perfect, temporary tokens are difficult to identify
    // A bad token returns 401, and a personal token returns 200
    return (
      err.statusCode === 403 &&
      err.result.message &&
      err.result.message.startsWith('Resource not accessible by integration')
    )
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const httpClient = new HttpClient('http-client-add-pr-comment-bot')

  try {
    const isTokenValid = await checkToken(httpClient, req.headers['temporary-github-token'])
    if (!isTokenValid) {
      return res.status(400).json({ error: 'Must provide a valid temporary github token' })
    }

    const { owner, repo, issueNumber } = req.query
    const response = await createOrUpdateComment(httpClient, {
      owner,
      repo,
      issueNumber,
      body: req.body.body,
      repoToken: process.env.GITHUB_TOKEN,
    })

    return res.status(200).json(response)
  } catch (err) {
    console.error(JSON.stringify(err))
    return res.status(500).json({ error: 'Internal server error' })
  }
}