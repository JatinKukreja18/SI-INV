type ApiErrorBody = { error?: string }

export async function fetchJsonArray<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T[]> {
  const response = await fetch(input, init)
  const body = await response.json().catch(() => null) as unknown

  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body
      ? (body as ApiErrorBody).error
      : undefined
    throw new Error(message ?? 'Request failed')
  }

  if (!Array.isArray(body)) {
    throw new Error('Expected an array response')
  }

  return body as T[]
}
