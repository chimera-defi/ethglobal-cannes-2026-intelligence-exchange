export function httpError(message: string, status = 500, code = 'INTERNAL_ERROR') {
  return Object.assign(new Error(message), { status, code });
}
