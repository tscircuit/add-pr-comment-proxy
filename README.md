# add-pr-comment-proxy

A simple proxy for PR comments built with Next.js. Works well with [add-pr-comment](https://github.com/mshick/add-pr-comment/). Workaround for GitHub making all token permissions read-only when a fork is submitted for a PR. See [this discussion](https://github.community/t/github-actions-are-severely-limited-on-prs/18179/4) for more detail.

## Deploy

**Requirements**

- A [personal access token](https://github.com/settings/tokens) with the `repo:public_repos` scope if you're using this to support a public repo. Your use-case might require other scopes.
- Node.js 14 or higher

**Development**

```bash
npm install
npm run dev
```

**Production**

```bash
npm install
npm run build
npm start
```

The API endpoint will be available at `/api/repos/:owner/:repo/issues/:issueNumber/comments`

## How it works

This app is a thin Node.js proxy around the [create an issue comment](https://docs.github.com/en/rest/reference/issues#create-an-issue-comment) GitHub endpoint that allows you to send requests with a GitHub Action's [temporary token](https://docs.github.com/en/actions/configuring-and-managing-workflows/authenticating-with-the-github_token#about-the-github_token-secret) and create issue comments. It verifies that your request has a valid temporary token, but it's difficult to ensure any more than that. A shared secret cannot be used as GitHub will strip it when the fork's Actions run.
