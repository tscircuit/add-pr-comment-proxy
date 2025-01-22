import { HttpClient } from '@actions/http-client'

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
    const { header, allowRepeats } = req.body

    if (allowRepeats === false && header) {
      // 1) Get existing comments
      const existingComments = await getComments(httpClient, {
        owner,
        repo,
        issueNumber,
        repoToken: process.env.GITHUB_TOKEN,
      })

      // 2) Search for an existing comment with the same "header" in the body
      const match = existingComments.result.find(
        (c) => c.body && c.body.includes(header)
      )

      if (match) {
        // 3) Update the match instead of creating a new comment
        const response = await updateComment(httpClient, {
          commentId: match.id,
          body: req.body.body,
          owner,
          repo,
          repoToken: process.env.GITHUB_TOKEN,
        })
        return res.status(200).json(response)
      }
    }

    // 4) Otherwise just create a new comment
    const response = await createComment(httpClient, {
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
