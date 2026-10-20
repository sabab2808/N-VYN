export function safeHttpsUrl(value: string | undefined | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

export function safeMailto(value: string | undefined | null) {
  if (!value || !/^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value)) return null
  return `mailto:${value}`
}
