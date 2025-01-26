import { HttpClient } from '@actions/http-client'

const getComments = async (http, params) => {
  const { repoToken, owner, repo, issueNumber } = params
  
  return http.getJson(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {
      accept: 'application/vnd.github.v3+json',
      authorization: `token ${repoToken}`,
    }
  )
}

const updateComment = async (http, params) => {
  const { repoToken, owner, repo, commentId, body } = params

  return http.patchJson(
    `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`,
    { body },
    {
      accept: 'application/vnd.github.v3+json',
      authorization: `token ${repoToken}`,
    }
  )
}

const createComment = async (http, params) => {
  const { repoToken, owner, repo, issueNumber, body } = params

  return http.postJson(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    { body },
    {
      accept: 'application/vnd.github.v3+json',
      authorization: `token ${repoToken}`,
    }
  )
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
    const { body, messageId } = req.body

    // If messageId is provided, try to find and update existing comment
    if (messageId) {
      const commentsResponse = await getComments(httpClient, {
        owner,
        repo,
        issueNumber,
        repoToken: process.env.GITHUB_TOKEN,
      })

      const comments = commentsResponse.result || []
      const existingComment = comments.find(comment => 
        comment.body.includes(`<!-- message-id: ${messageId} -->`)
      )

      if (existingComment) {
        // Update existing comment
        const response = await updateComment(httpClient, {
          owner,
          repo,
          commentId: existingComment.id,
          body: `<!-- message-id: ${messageId} -->\n${body}`,
          repoToken: process.env.GITHUB_TOKEN,
        })
        return res.status(200).json(response)
      }
    }

    // Create new comment if no existing comment found or no messageId provided
    const response = await createComment(httpClient, {
      owner,
      repo,
      issueNumber,
      body: messageId ? `<!-- message-id: ${messageId} -->\n${body}` : body,
      repoToken: process.env.GITHUB_TOKEN,
    })

    return res.status(200).json(response)
  } catch (err) {
    console.error(JSON.stringify(err))
    return res.status(500).json({ error: 'Internal server error' })
  }
}
