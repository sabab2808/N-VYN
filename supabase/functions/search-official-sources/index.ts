import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const CACHE_TTL_MS = 15 * 60 * 1000
const RATE_WINDOW_MS = 60 * 1000
const SEARCH_TIMEOUT_MS = 12_000
const MAX_QUERY_LENGTH = 240
const MAX_RESULTS = 8
const STATIC_DOMAINS: Record<string, string[]> = {
  'South Korea': ['studyinkorea.go.kr', 'mofa.go.kr', 'go.kr', 'ac.kr'],
  Germany: ['daad.de', 'uni-assist.de', 'hochschulkompass.de', 'kmk.org', 'auswaertiges-amt.de', 'cit.tum.de'],
  France: ['campusfrance.org', 'campusfrance.com', 'gouv.fr', 'universite-paris-saclay.fr', 'mosig.imag.fr'],
}

type Country = keyof typeof STATIC_DOMAINS
type SearchResult = { title: string; url: string; description: string; age: string | null }

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const braveKey = Deno.env.get('BRAVE_SEARCH_API_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Server configuration is incomplete' }, 500)
  if (!braveKey) return json({ error: 'Live search is not configured. Add BRAVE_SEARCH_API_KEY to Supabase function secrets.' }, 503)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'Sign in to search official sources.' }, 401)
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Authentication required' }, 401)

  let body: { query?: unknown; country?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400)
  }
  const query = typeof body.query === 'string' ? body.query.trim().replace(/\s+/g, ' ') : ''
  const country = body.country
  if (!query || query.length > MAX_QUERY_LENGTH) return json({ error: `Enter a search phrase of 1–${MAX_QUERY_LENGTH} characters.` }, 400)
  if (typeof country !== 'string' || !Object.hasOwn(STATIC_DOMAINS, country)) return json({ error: 'Choose South Korea, Germany, or France.' }, 400)
  const selectedCountry = country as Country

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const hash = await sha256(`${selectedCountry}\n${query.toLowerCase()}`)
  const { data: cached, error: cacheError } = await admin
    .from('research_search_cache').select('results,searched_at,expires_at')
    .eq('user_id', authData.user.id).eq('country', selectedCountry).eq('query_hash', hash).maybeSingle()
  if (cacheError) return json({ error: 'Could not read the private search cache.', detail: cacheError.message }, 500)
  if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
    return json({ results: cached.results, searchedAt: cached.searched_at, cached: true, sourceScope: 'official domains only' })
  }

  const { data: canSearch, error: rateLimitError } = await admin.rpc('claim_research_search_request', { p_user_id: authData.user.id })
  if (rateLimitError) return json({ error: 'Could not enforce the search rate limit.', detail: rateLimitError.message }, 500)
  if (!canSearch) return json({ error: `Search rate limit reached. Try again in about ${Math.ceil(RATE_WINDOW_MS / 1000)} seconds.` }, 429)

  const { data: confirmedSources, error: sourceError } = await admin
    .from('source_evidence')
    .select('url,universities!inner(country)')
    .eq('user_id', authData.user.id)
    .eq('verification_status', 'confirmed')
    .eq('universities.country', selectedCountry)
  if (sourceError) return json({ error: 'Could not load manually confirmed official domains.', detail: sourceError.message }, 500)

  const allowedDomains = new Set(STATIC_DOMAINS[selectedCountry])
  for (const source of confirmedSources ?? []) {
    try {
      const sourceUrl = new URL(source.url)
      if (sourceUrl.protocol === 'https:' && !sourceUrl.username && !sourceUrl.password) allowedDomains.add(sourceUrl.hostname.toLowerCase())
    } catch {
      console.warn('Ignoring an invalid confirmed source URL during search filtering.')
    }
  }
  const queryDomains = [...allowedDomains]
  const searchQuery = `${query} ${queryDomains.map(domain => `site:${domain}`).join(' OR ')}`
  let response: Response
  try {
    response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=${MAX_RESULTS}&search_lang=en`, {
      headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
  } catch (error) {
    return json({ error: 'Official-source search could not reach Brave Search.', detail: error instanceof Error ? error.message : 'Network request failed' }, 502)
  }
  if (!response.ok) return json({ error: `Brave Search returned HTTP ${response.status}. Check the server-side API key and quota.` }, response.status === 429 ? 429 : 502)

  let payload: { web?: { results?: Record<string, unknown>[] } }
  try {
    payload = await response.json()
  } catch {
    return json({ error: 'Brave Search returned an invalid response.' }, 502)
  }
  const results: SearchResult[] = []
  for (const item of payload.web?.results ?? []) {
    const title = typeof item.title === 'string' ? item.title.slice(0, 300) : ''
    const description = typeof item.description === 'string' ? item.description.slice(0, 900) : ''
    if (!title) continue
    try {
      const resultUrl = new URL(String(item.url ?? ''))
      if (resultUrl.protocol !== 'https:' || resultUrl.username || resultUrl.password || !isAllowedHost(resultUrl.hostname, queryDomains)) continue
      results.push({ title, url: resultUrl.toString(), description, age: typeof item.age === 'string' ? item.age : null })
    } catch {
      continue
    }
    if (results.length >= MAX_RESULTS) break
  }

  const searchedAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString()
  const { error: saveError } = await admin.from('research_search_cache').upsert({
    user_id: authData.user.id, country: selectedCountry, query_hash: hash,
    results, searched_at: searchedAt, expires_at: expiresAt,
  })
  if (saveError) return json({ error: 'Search completed but the private result cache could not be saved.', detail: saveError.message }, 500)
  return json({ results, searchedAt, cached: false, sourceScope: 'official domains only' })
})

function isAllowedHost(hostname: string, domains: string[]) {
  const host = hostname.toLowerCase()
  return domains.some(domain => host === domain || host.endsWith(`.${domain}`))
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
