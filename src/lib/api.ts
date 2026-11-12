export class ApiError extends Error {
  status: number;
  code?: string;
  changes?: string[];

  constructor(message: string, status: number, code?: string, changes?: string[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.changes = changes;
  }
}

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const resp = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  const text = await resp.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!resp.ok) {
    throw new ApiError(
      data?.error || `Erro na requisição (${resp.status})`,
      resp.status,
      data?.code,
      data?.changes
    );
  }

  return data as T;
}
