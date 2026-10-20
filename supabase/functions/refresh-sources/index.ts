import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-job-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MAX_SOURCES = 6
const MAX_SOURCE_CANDIDATES = 500
const MIN_SOURCE_REFRESH_INTERVAL_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 12_000
const MAX_HTML_BYTES = 1_500_000
const DELAY_BETWEEN_HOSTS_MS = 5_000
const MAX_REDIRECTS = 3

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Server configuration is incomplete' }, 500)
  const allowedHosts = (Deno.env.get('REFRESH_ALLOWED_HOSTS') ?? '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean)
  if (!allowedHosts.length) return json({ error: 'REFRESH_ALLOWED_HOSTS must list trusted official source domains' }, 500)

  const jobSecret = Deno.env.get('REFRESH_JOB_SECRET')
  const isScheduled = Boolean(jobSecret && request.headers.get('x-job-secret') === jobSecret)
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  let userId: string | null = null
  if (!isScheduled) {
    const { data, error } = await userClient.auth.getUser()
    if (error || !data.user) return json({ error: 'Authentication required' }, 401)
    userId = data.user.id
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  let sourceQuery = admin.from('source_evidence').select('id,user_id,url,etag,last_modified,content_sha256,last_attempted_at').order('last_attempted_at', { ascending: true, nullsFirst: true }).limit(MAX_SOURCE_CANDIDATES)
  if (userId) sourceQuery = sourceQuery.eq('user_id', userId)
  const { data: sources, error: loadError } = await sourceQuery
  if (loadError) return json({ error: 'Could not load source URLs', detail: loadError.message }, 500)

  const results: { id: string; outcome: string; status?: number }[] = []
  const visitedHosts = new Set<string>()
  let attemptedSources = 0
  let skippedSources = 0
  for (const source of sources ?? []) {
    if (attemptedSources >= MAX_SOURCES) break
    if (source.last_attempted_at && Date.now() - new Date(source.last_attempted_at).getTime() < MIN_SOURCE_REFRESH_INTERVAL_MS) {
      skippedSources++
      continue
    }
    let url: URL
    try {
      url = new URL(source.url)
      assertAllowedUrl(url, allowedHosts)
    } catch (error) {
      const claim = await claimSource(admin, source)
      if (claim.error) {
        attemptedSources++
        await logRefresh(admin, source.user_id, source.id, 'failed', null, 1, 0, `${String(error)}; ${claim.error}`)
        results.push({ id: source.id, outcome: 'failed' })
      } else if (claim.claimed) {
        attemptedSources++
        await logRefresh(admin, source.user_id, source.id, 'failed', null, 1, 0, String(error))
        results.push({ id: source.id, outcome: 'failed' })
      } else {
        skippedSources++
      }
      continue
    }
    if (visitedHosts.has(url.hostname)) {
      skippedSources++
      continue
    }
    visitedHosts.add(url.hostname)
    const claim = await claimSource(admin, source)
    if (claim.error) {
      attemptedSources++
      await logRefresh(admin, source.user_id, source.id, 'failed', null, 1, 0, `Could not record refresh attempt: ${claim.error}`)
      results.push({ id: source.id, outcome: 'failed' })
      continue
    }
    if (!claim.claimed) {
      skippedSources++
      continue
    }
    attemptedSources++
    const { data: previous, error: previousError } = await admin.from('source_evidence').select('etag,last_modified,content_sha256,content_snapshot').eq('id', source.id).eq('user_id', source.user_id).single()
    if (previousError || !previous) {
      await logRefresh(admin, source.user_id, source.id, 'failed', null, 1, 0, 'Could not load cached HTTP metadata')
      results.push({ id: source.id, outcome: 'failed' })
      continue
    }
    const started = Date.now()
    let response: Response | null = null
    let attempt = 0
    let errorMessage: string | null = null
    for (attempt = 1; attempt <= 3; attempt++) {
      try {
        const headers = new Headers({ 'User-Agent': 'KoreaMastersCommandCenter/1.0 (official source freshness check)', Accept: 'text/html,application/xhtml+xml' })
        if (previous.etag) headers.set('If-None-Match', previous.etag)
        if (previous.last_modified) headers.set('If-Modified-Since', previous.last_modified)
        response = await fetchTrustedUrl(url, headers, allowedHosts)
        if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) break
        await response.body?.cancel()
        await delay(attempt * 1_500)
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Network request failed'
        if (attempt === 3) break
        await delay(attempt * 1_500)
      }
    }
    const duration = Date.now() - started
    if (!response) {
      await logRefresh(admin, source.user_id, source.id, 'failed', null, attempt, duration, errorMessage ?? 'No response')
      results.push({ id: source.id, outcome: 'failed' })
      await delay(DELAY_BETWEEN_HOSTS_MS)
      continue
    }
    if (response.status === 304) {
      const { error } = await admin.from('source_evidence').update({ last_checked_at: new Date().toISOString(), last_http_status: 304 }).eq('id', source.id).eq('user_id', source.user_id)
      await logRefresh(admin, source.user_id, source.id, error ? 'failed' : 'not_modified', 304, attempt, duration, error?.message ?? null)
      results.push({ id: source.id, outcome: error ? 'failed' : 'not_modified', status: 304 })
    } else if (response.ok) {
      const body = await response.body?.getReader()
      const chunks: Uint8Array[] = []
      let bytes = 0
      while (body) {
        const part = await body.read()
        if (part.done) break
        bytes += part.value.length
        if (bytes > MAX_HTML_BYTES) {
          await body.cancel()
          break
        }
        chunks.push(part.value)
      }
      if (bytes > MAX_HTML_BYTES) {
        await logRefresh(admin, source.user_id, source.id, 'failed', response.status, attempt, duration, 'Page exceeded size limit')
        results.push({ id: source.id, outcome: 'failed', status: response.status })
      } else {
        const data = new Uint8Array(bytes)
        let offset = 0
        for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length }
        const digest = await crypto.subtle.digest('SHA-256', data)
        const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
        const changed = Boolean(previous.content_sha256 && previous.content_sha256 !== sha256)
        const contentSnapshot = extractPageText(new TextDecoder().decode(data))
        const update: Record<string, unknown> = {
          last_checked_at: new Date().toISOString(), last_http_status: response.status, content_sha256: sha256,
          etag: response.headers.get('etag'), last_modified: response.headers.get('last-modified'),
          content_snapshot: contentSnapshot,
          ...(changed ? { needs_review: true } : {}),
        }
        const { error: changeHistoryError } = changed ? await admin.from('source_changes').insert({
            source_evidence_id: source.id, user_id: source.user_id,
            old_sha256: previous.content_sha256, new_sha256: sha256,
            old_content_snapshot: previous.content_snapshot, new_content_snapshot: contentSnapshot,
          }) : { error: null }
        const { error: updateError } = changeHistoryError
          ? { error: null }
          : await admin.from('source_evidence').update(update).eq('id', source.id).eq('user_id', source.user_id)
        const failure = changeHistoryError?.message ?? updateError?.message
        await logRefresh(admin, source.user_id, source.id, failure ? 'failed' : 'success', response.status, attempt, Date.now() - started, failure)
        results.push({ id: source.id, outcome: changeHistoryError ? 'change_history_failed' : updateError ? 'failed' : changed ? 'changed_review_required' : 'success', status: response.status })
      }
    } else {
      await logRefresh(admin, source.user_id, source.id, response.status === 429 ? 'rate_limited' : 'failed', response.status, attempt, duration, `HTTP ${response.status}`)
      results.push({ id: source.id, outcome: response.status === 429 ? 'rate_limited' : 'failed', status: response.status })
    }
    await delay(DELAY_BETWEEN_HOSTS_MS)
  }
  return json({ checked: attemptedSources, skipped: skippedSources, results, message: 'Fetch results are freshness metadata only. No source facts or verification status were changed.' })
})

async function logRefresh(client: ReturnType<typeof createClient>, userId: string, sourceId: string, outcome: 'success' | 'not_modified' | 'failed' | 'rate_limited' | 'skipped', status: number | null, attemptCount: number, durationMs: number, errorMessage: string | null) {
  const { error } = await client.from('refresh_logs').insert({ user_id: userId, source_evidence_id: sourceId, outcome, http_status: status, attempt_count: attemptCount, duration_ms: durationMs, error_message: errorMessage })
  if (error) console.error('Could not record source refresh log', sourceId, error.message)
}

function extractPageText(html: string) {
  return html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20_000)
}

function delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }

async function claimSource(client: ReturnType<typeof createClient>, source: { id: string; user_id: string; last_attempted_at: string | null }) {
  const cooldownCutoff = new Date(Date.now() - MIN_SOURCE_REFRESH_INTERVAL_MS).toISOString()
  let query = client.from('source_evidence').update({ last_attempted_at: new Date().toISOString() }).eq('id', source.id).eq('user_id', source.user_id)
  query = source.last_attempted_at ? query.lt('last_attempted_at', cooldownCutoff) : query.is('last_attempted_at', null)
  const { data, error } = await query.select('id').maybeSingle()
  return { claimed: Boolean(data), error: error?.message ?? null }
}

function assertAllowedUrl(url: URL, allowedHosts: string[]) {
  const hostname = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    !allowedHosts.some(host => hostname === host || hostname.endsWith(`.${host}`))) {
    throw new Error('URL is outside the configured HTTPS source-host allowlist')
  }
}

async function fetchTrustedUrl(initialUrl: URL, headers: Headers, allowedHosts: string[]) {
  let url = initialUrl
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    assertAllowedUrl(url, allowedHosts)
    const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location || redirects === MAX_REDIRECTS) throw new Error('Too many or invalid redirects')
    url = new URL(location, url)
    assertAllowedUrl(url, allowedHosts)
  }
  throw new Error('Too many redirects')
}
