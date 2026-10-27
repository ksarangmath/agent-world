export function logError(context: string, error: unknown) {
  if (!(error instanceof Error)) return console.error(context, typeof error)
  const { status, code, cause } = error as {
    status?: number
    code?: string
    cause?: { code?: string }
  }
  console.error(context, [error.name, status, code, cause?.code].filter(Boolean).join(' '))
}
