import { describe, expect, it, vi } from 'vitest';
import { KaneoError, type Column, type KaneoClient } from '../src/kaneo';
import type { TaskMail } from '../src/message';
import { Processor, resolveColumn } from '../src/processor';

const column = (slug: string, position: number, name = slug): Column => ({
  id: `id-${slug}`,
  projectId: 'p1',
  name,
  slug,
  position,
});

const columns = [column('done', 2, 'Done'), column('to-do', 0, 'To Do'), column('mail', 1, 'Mail')];

const mail = (overrides: Partial<TaskMail> = {}): TaskMail => ({
  projectId: 'p1',
  column: null,
  title: 'Title',
  description: 'Body',
  dueDate: null,
  ...overrides,
});

function fakeKaneo(cols: Column[] | KaneoError = columns, create: KaneoError | null = null) {
  const getColumns = vi.fn(() => (cols instanceof KaneoError ? Promise.reject(cols) : Promise.resolve(cols)));
  const createTask = vi.fn(() => (create ? Promise.reject(create) : Promise.resolve({ id: 't1' })));
  return { getColumns, createTask, kaneo: { getColumns, createTask } as unknown as KaneoClient };
}

describe('resolveColumn', () => {
  it('prefers the mail column by default', () => {
    expect(resolveColumn(columns, null)?.slug).toBe('mail');
  });

  it('falls back to the first column by position', () => {
    expect(resolveColumn([column('done', 2), column('backlog', 0)], null)?.slug).toBe('backlog');
  });

  it('matches a column named Mail with another slug', () => {
    expect(resolveColumn([column('to-do', 0), column('inbox', 1, 'Mail')], null)?.slug).toBe('inbox');
  });

  it('matches an explicit id, slug or name', () => {
    expect(resolveColumn(columns, 'id-done')?.slug).toBe('done');
    expect(resolveColumn(columns, 'To-Do')?.slug).toBe('to-do');
    expect(resolveColumn(columns, 'to do')?.slug).toBe('to-do');
  });

  it('returns undefined for an unknown explicit column', () => {
    expect(resolveColumn(columns, 'nope')).toBeUndefined();
  });

  it('returns undefined for a project without columns', () => {
    expect(resolveColumn([], null)).toBeUndefined();
  });
});

describe('Processor', () => {
  it('creates a task in the resolved column', async () => {
    const { kaneo, createTask } = fakeKaneo();
    const outcome = await new Processor(kaneo).process(mail({ dueDate: '2026-12-24T17:30:00.000Z' }));

    expect(outcome).toEqual({ state: 'accepted', taskId: 't1' });
    expect(createTask).toHaveBeenCalledWith('p1', {
      title: 'Title',
      description: 'Body',
      status: 'mail',
      dueDate: '2026-12-24T17:30:00.000Z',
    });
  });

  it('rejects mail without a project header', async () => {
    const { kaneo, getColumns } = fakeKaneo();
    const outcome = await new Processor(kaneo).process(mail({ projectId: null }));
    expect(outcome.state).toBe('rejected');
    expect(outcome).toHaveProperty('reason', 'missing x-kaneo-project-id header');
    expect(getColumns).not.toHaveBeenCalled();
  });

  it('creates a task in the default project when the header is missing', async () => {
    const { kaneo, createTask } = fakeKaneo();
    const processor = new Processor(kaneo, { projectId: 'p1', column: 'to-do' });
    const outcome = await processor.process(mail({ projectId: null, column: null }));

    expect(outcome).toEqual({ state: 'accepted', taskId: 't1' });
    expect(createTask).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'to-do' }));
  });

  it('prefers the message headers over the defaults', async () => {
    const { kaneo, createTask } = fakeKaneo();
    const processor = new Processor(kaneo, { projectId: 'p1', column: 'mail' });
    await processor.process(mail({ projectId: 'p2', column: 'done' }));

    expect(createTask).toHaveBeenCalledWith('p2', expect.objectContaining({ status: 'done' }));
  });

  it('rejects an unknown column', async () => {
    const { kaneo } = fakeKaneo();
    const outcome = await new Processor(kaneo).process(mail({ column: 'nope' }));
    expect(outcome).toEqual({
      state: 'rejected',
      reason: 'no column matching x-kaneo-column "nope" in project p1',
    });
  });

  it('rejects a project without columns', async () => {
    const { kaneo } = fakeKaneo([]);
    expect(await new Processor(kaneo).process(mail())).toMatchObject({ state: 'rejected' });
  });

  it('rejects when Kaneo refuses the project', async () => {
    const { kaneo } = fakeKaneo(new KaneoError('forbidden', 403));
    expect(await new Processor(kaneo).process(mail())).toEqual({ state: 'rejected', reason: 'forbidden' });
  });

  it('retries on temporary errors', async () => {
    const { kaneo } = fakeKaneo(columns, new KaneoError('server down', 503));
    expect(await new Processor(kaneo).process(mail())).toEqual({ state: 'retry', reason: 'server down' });
  });

  it('rethrows unexpected errors', async () => {
    const { kaneo, getColumns } = fakeKaneo();
    getColumns.mockRejectedValueOnce(new TypeError('boom'));
    await expect(new Processor(kaneo).process(mail())).rejects.toThrow('boom');
  });

  it('fetches columns once per project', async () => {
    const { kaneo, getColumns } = fakeKaneo();
    const processor = new Processor(kaneo);
    await processor.process(mail());
    await processor.process(mail());
    await processor.process(mail({ projectId: 'p2' }));
    expect(getColumns).toHaveBeenCalledTimes(2);
  });
});
