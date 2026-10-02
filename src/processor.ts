import { KaneoError, type Column, type KaneoClient } from './kaneo';
import { COLUMN_HEADER, PROJECT_HEADER, type TaskMail } from './message';

export const DEFAULT_COLUMN = 'mail';

export type Outcome =
  { state: 'accepted'; taskId: string } | { state: 'rejected'; reason: string } | { state: 'retry'; reason: string };

/**
 * Picks the target column. An explicit header value matches a column id, slug or
 * name. Without one, the column called "mail" wins, else the first column on the board.
 */
export function resolveColumn(columns: Column[], wanted: string | null): Column | undefined {
  if (wanted !== null) {
    const needle = wanted.toLowerCase();
    return (
      columns.find((c) => c.id === wanted) ??
      columns.find((c) => c.slug === needle) ??
      columns.find((c) => c.name.toLowerCase() === needle)
    );
  }

  const sorted = [...columns].sort((a, b) => a.position - b.position);
  return sorted.find((c) => c.slug === DEFAULT_COLUMN || c.name.toLowerCase() === DEFAULT_COLUMN) ?? sorted[0];
}

export class Processor {
  private readonly columns = new Map<string, Promise<Column[]>>();

  constructor(private readonly kaneo: KaneoClient) {}

  async process(mail: TaskMail): Promise<Outcome> {
    if (!mail.projectId) {
      return { state: 'rejected', reason: `missing ${PROJECT_HEADER} header` };
    }

    try {
      const columns = await this.columnsOf(mail.projectId);
      const column = resolveColumn(columns, mail.column);
      if (!column) {
        const reason =
          mail.column === null
            ? `project ${mail.projectId} has no columns`
            : `no column matching ${COLUMN_HEADER} "${mail.column}" in project ${mail.projectId}`;
        return { state: 'rejected', reason };
      }

      const task = await this.kaneo.createTask(mail.projectId, {
        title: mail.title,
        description: mail.description,
        status: column.slug,
        ...(mail.dueDate ? { dueDate: mail.dueDate } : {}),
      });
      return { state: 'accepted', taskId: task.id };
    } catch (error) {
      if (error instanceof KaneoError) {
        return { state: error.permanent ? 'rejected' : 'retry', reason: error.message };
      }
      throw error;
    }
  }

  /** Columns are fetched once per project per run. */
  private columnsOf(projectId: string): Promise<Column[]> {
    let columns = this.columns.get(projectId);
    if (!columns) {
      columns = this.kaneo.getColumns(projectId);
      this.columns.set(projectId, columns);
    }
    return columns;
  }
}
