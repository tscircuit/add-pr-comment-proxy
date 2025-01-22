#!/usr/bin/env node

import { HttpClient } from '@actions/http-client'

function parseGitHubUrl(url) {
  try {
    const regex = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
    const match = url.match(regex)
    if (!match) {
      throw new Error('Invalid GitHub PR URL format')
    }
    return {
      owner: match[1],
      repo: match[2],
      issueNumber: match[3]
    }
  } catch (error) {
    console.error('Error parsing URL:', error.message)
    process.exit(1)
  }
}

async function testComment(prUrl) {
  const { owner, repo, issueNumber } = parseGitHubUrl(prUrl)
  const http = new HttpClient('test-comment-script')
  
  const testComment = {
    body: `Test comment from bot at ${new Date().toISOString()}`,
    header: 'Test Comment Header',
    allowRepeats: false
  }

  try {
    const response = await http.postJson(
      `https://tscircuit-add-pr-comment-proxy.vercel.app/api/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      testComment,
      {
        'temporary-github-token': process.env.GITHUB_TOKEN
      }
    )

    console.log('Response status:', response.statusCode)
    console.log('Response body:', response.result)
    
    if (response.statusCode === 200) {
      console.log('✅ Comment submitted successfully!')
    } else {
      console.log('❌ Failed to submit comment')
    }
  } catch (error) {
    console.error('Error submitting comment:', error.message)
    process.exit(1)
  }
}

const prUrl = process.argv[2]
if (!prUrl) {
  console.error('Please provide a GitHub PR URL')
  console.error('Usage: node test-comment.js https://github.com/owner/repo/pull/123')
  process.exit(1)
}

testComment(prUrl)
