export interface Column {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  position: number;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  /** Slug of the target column. */
  status: string;
  dueDate?: string;
}

export interface Task {
  id: string;
  projectId: string;
  number: number | null;
  title: string;
  status: string;
}

export class KaneoError extends Error {
  override name = 'KaneoError';

  /** HTTP status, or 0 when the request never got a response. */
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  /**
   * True when the request itself is wrong (unknown project or column, no access),
   * so retrying the same mail will never succeed. Auth, billing, rate limit and
   * server errors are treated as temporary.
   */
  get permanent(): boolean {
    return this.status === 400 || this.status === 403 || this.status === 404;
  }
}

export class KaneoClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Columns of a project, ordered by board position. */
  getColumns(projectId: string): Promise<Column[]> {
    return this.request<Column[]>('GET', `/column/${encodeURIComponent(projectId)}`);
  }

  createTask(projectId: string, input: CreateTaskInput): Promise<Task> {
    return this.request<Task>('POST', `/task/${encodeURIComponent(projectId)}`, {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: 'no-priority',
      ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new KaneoError(`${method} ${path} failed: ${(error as Error).message}`, 0);
    }

    if (!response.ok) {
      throw new KaneoError(
        `${method} ${path} returned ${response.status}: ${await errorMessage(response)}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }
}

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(text) as { message?: unknown };
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    // Not JSON, fall through to the raw text.
  }
  return text.slice(0, 200) || response.statusText;
}
