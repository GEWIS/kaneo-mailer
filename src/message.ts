import { simpleParser, type HeaderValue } from 'mailparser';

export const PROJECT_HEADER = 'x-kaneo-project-id';
export const COLUMN_HEADER = 'x-kaneo-column';

export interface TaskMail {
  /** Kaneo project to create the task in. Null when the header is missing. */
  projectId: string | null;
  /** Column id, slug or name. Null means "use the default column". */
  column: string | null;
  title: string;
  description: string;
  /** ISO timestamp parsed from the subject, if it contains one. */
  dueDate: string | null;
}

function headerText(value: HeaderValue | undefined): string | null {
  if (value === undefined) return null;
  const first: unknown = Array.isArray(value) ? value[0] : value;
  if (typeof first !== 'string') return null;
  const trimmed = first.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Finds a `dd-mm-yyyy hh:mm` timestamp in the subject and returns it as an ISO string.
 * The timestamp is read in the process timezone (set `TZ` in the container).
 */
export function extractDueDate(subject: string): string | null {
  const match = /(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})/.exec(subject);
  if (!match) return null;

  const [day, month, year, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(year, month - 1, day, hour, minute);

  // Reject values that Date silently rolls over, such as 31-02 or 25:00.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date.toISOString();
}

export async function parseMessage(source: Buffer | string): Promise<TaskMail> {
  const mail = await simpleParser(source);
  const subject = mail.subject?.trim() ?? '';

  return {
    projectId: headerText(mail.headers.get(PROJECT_HEADER)),
    column: headerText(mail.headers.get(COLUMN_HEADER)),
    title: subject || '(no subject)',
    description: mail.text?.trim() ?? '',
    dueDate: extractDueDate(subject),
  };
}
