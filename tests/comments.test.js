import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

// Exercise the existing helper without loading the server or its credentials.
const source = await readFile(
  new URL('../pages/api/repos/[owner]/[repo]/issues/[issueNumber]/comments.js', import.meta.url),
  'utf8'
)
const start = source.indexOf('const createOrUpdateComment =')
const end = source.indexOf('\nconst checkToken =', start)
assert.ok(start >= 0 && end > start, 'Could not locate the production helper')
const createOrUpdateComment = runInNewContext(
  source.slice(start, end) + '\ncreateOrUpdateComment',
  {}
)

const params = {
  repoToken: 'test-only-token',
  owner: 'example-owner',
  repo: 'example-repo',
  issueNumber: 42,
  body: 'updated report',
}
const commentsUrl = 'https://api.github.com/repos/example-owner/example-repo/issues/42/comments'
const updateUrl = 'https://api.github.com/repos/example-owner/example-repo/issues/comments/'
const human = id => ({ id, user: { login: 'reviewer' }, body: 'discussion' })
const bot = id => ({ id, user: { login: 'tscircuitbot' }, body: 'old report' })
const humans = count => Array.from({ length: count }, (_, i) => human(i + 1))

function fixture(comments, { failPage, failWrite } = {}) {
  const calls = []
  const failure = new Error('fixture request failure')
  const response = { statusCode: 200, result: { id: 999 }, headers: {} }
  function checkHeaders(headers) {
    assert.equal(headers.accept, 'application/vnd.github.v3+json')
    assert.equal(headers.authorization, 'token test-only-token')
  }
  function write(method, url, payload, headers) {
    checkHeaders(headers)
    calls.push({ method, url, body: payload.body })
    assert.equal(payload.body, params.body)
    assert.deepEqual(Object.keys(payload), ['body'])
    if (failWrite === method) throw failure
    return response
  }
  const http = {
    async getJson(raw, headers) {
      checkHeaders(headers)
      const url = new URL(raw)
      assert.equal(url.origin + url.pathname, commentsUrl)
      const page = Number(url.searchParams.get('page') || 1)
      const perPage = Number(url.searchParams.get('per_page') || 30)
      assert.ok(Number.isInteger(page) && page > 0)
      assert.ok(Number.isInteger(perPage) && perPage > 0 && perPage <= 100)
      const reads = calls.filter(call => call.method === 'GET')
      assert.equal(page, reads.length + 1, 'Pages must be visited once, in order')
      if (reads.length) assert.equal(perPage, reads[0].perPage)
      assert.ok(calls.every(call => call.method === 'GET'), 'Do not read after writing')
      const result = comments.slice((page - 1) * perPage, page * perPage)
      calls.push({ method: 'GET', url: raw, page, perPage, count: result.length })
      if (page === failPage) throw failure
      const headersOut = page * perPage < comments.length
        ? { link: '<' + commentsUrl + '?per_page=' + perPage + '&page=' + (page + 1) + '>; rel="next"' }
        : {}
      return { statusCode: 200, result, headers: headersOut }
    },
    async patchJson(url, payload, headers) { return write('PATCH', url, payload, headers) },
    async postJson(url, payload, headers) { return write('POST', url, payload, headers) },
  }
  return { http, calls, failure, response }
}

function assertWrite(f, method, url) {
  const writes = f.calls.filter(call => call.method !== 'GET')
  assert.equal(writes.length, 1)
  assert.equal(writes[0].method, method)
  assert.equal(writes[0].url, url)
  assert.equal(writes[0].body, params.body)
}

function assertExhausted(f) {
  const reads = f.calls.filter(call => call.method === 'GET')
  assert.ok(reads.length > 0)
  assert.ok(reads.at(-1).count < reads.at(-1).perPage, 'Read through the final partial or empty page before creating')
}

test('updates the first match without fetching later pages', async () => {
  const f = fixture([bot(901), ...humans(205), bot(902)], { failPage: 2 })
  assert.equal(await createOrUpdateComment(f.http, params), f.response)
  assertWrite(f, 'PATCH', updateUrl + '901')
  assert.equal(f.calls.filter(call => call.method === 'GET').length, 1)
})

for (const position of [31, 101, 201]) {
  test('updates the existing bot at position ' + position, async () => {
    const f = fixture([...humans(position - 1), bot(901)])
    assert.equal(await createOrUpdateComment(f.http, params), f.response)
    assertWrite(f, 'PATCH', updateUrl + '901')
    const reads = f.calls.filter(call => call.method === 'GET')
    assert.equal(reads.length, Math.ceil(position / reads[0].perPage))
  })
}

test('keeps first-match semantics for duplicate bots on a later page', async () => {
  const f = fixture([...humans(100), bot(901), bot(902), ...humans(100)], { failPage: 3 })
  assert.equal(await createOrUpdateComment(f.http, params), f.response)
  assertWrite(f, 'PATCH', updateUrl + '901')
})

for (const count of [0, 2, 100, 205]) {
  test('creates once after checking all ' + count + ' nonmatching comments', async () => {
    const f = fixture(humans(count))
    assert.equal(await createOrUpdateComment(f.http, params), f.response)
    assertWrite(f, 'POST', commentsUrl)
    assertExhausted(f)
    const reads = f.calls.filter(call => call.method === 'GET')
    assert.equal(reads.length, Math.floor(count / reads[0].perPage) + 1)
  })
}

for (const failPage of [1, 2]) {
  test('does not create or update after page ' + failPage + ' fails', async () => {
    const f = fixture([...humans(205), bot(901)], { failPage })
    await assert.rejects(createOrUpdateComment(f.http, params), error => error === f.failure)
    assert.ok(f.calls.every(call => call.method === 'GET'))
    assert.equal(f.calls.length, failPage)
  })
}

test('propagates a failed update without creating a replacement', async () => {
  const f = fixture([bot(901)], { failWrite: 'PATCH' })
  await assert.rejects(createOrUpdateComment(f.http, params), error => error === f.failure)
  assertWrite(f, 'PATCH', updateUrl + '901')
})

test('propagates a failed create without retrying', async () => {
  const f = fixture([], { failWrite: 'POST' })
  await assert.rejects(createOrUpdateComment(f.http, params), error => error === f.failure)
  assertWrite(f, 'POST', commentsUrl)
})
