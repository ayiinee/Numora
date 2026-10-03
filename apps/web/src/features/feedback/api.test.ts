import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningApiError } from '../core-learning/api';
import { FEEDBACK_PAGE_SIZE, feedbackApi } from './api';

afterEach(() => vi.unstubAllGlobals());

function json(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe('feedback API boundary', () => {
  it('sends a note with only the client request identity and body', async () => {
    const fetchMock = json({ id: 'feedback-test' }, 201);
    vi.stubGlobal('fetch', fetchMock);

    await feedbackApi.send('private-token', 'class 1', 'student/1', {
      clientRequestId: 'request-test',
      body: 'Kerja bagus.',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/classes/class%201/students/student%2F1/feedback');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      clientRequestId: 'request-test',
      body: 'Kerja bagus.',
    });
    expect(url).not.toContain('private-token');
    expect(String(init.body)).not.toContain('teacherId');
  });

  it('pages feedback lists with the server default page size and an offset', async () => {
    const fetchMock = json({ items: [], nextOffset: null });
    vi.stubGlobal('fetch', fetchMock);

    await feedbackApi.studentList('private-token', 40);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/students/me/feedback?');
    expect(new URL(url).searchParams.get('offset')).toBe('40');
    expect(Number(new URL(url).searchParams.get('limit'))).toBe(FEEDBACK_PAGE_SIZE);
  });

  it('scopes the Teacher list and history to one owned class and student', async () => {
    const fetchMock = json({ items: [], nextOffset: null });
    vi.stubGlobal('fetch', fetchMock);
    await feedbackApi.teacherList('private-token', 'class-test', 'student-test', 0);
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain(
      '/classes/class-test/students/student-test/feedback',
    );

    const history = json({ records: [], nextCursor: null });
    vi.stubGlobal('fetch', history);
    await feedbackApi.teacherHistory('private-token', 'class-test', 'student-test', 'cursor 1');
    const [url, init] = history.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/classes/class-test/students/student-test/assessment-results?');
    expect(new URL(url).searchParams.get('cursor')).toBe('cursor 1');
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('marks read through a POST on the note identity only', async () => {
    const fetchMock = json({ id: 'feedback-test', readAt: '2026-10-01T04:00:00.000Z' }, 201);
    vi.stubGlobal('fetch', fetchMock);

    await feedbackApi.markRead('private-token', 'feedback-test');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/students/me/feedback/feedback-test/read');
    expect(init.method).toBe('POST');
  });

  it('keeps server problem details so the UI can tell empty apart from denied', async () => {
    vi.stubGlobal(
      'fetch',
      json({ code: 'FEEDBACK_REQUEST_CONFLICT', detail: 'ID pengiriman sudah dipakai.' }, 409),
    );

    await expect(
      feedbackApi.send('token', 'class-test', 'student-test', {
        clientRequestId: 'request-test',
        body: 'Catatan',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'FEEDBACK_REQUEST_CONFLICT' });
    await expect(
      feedbackApi.send('token', 'class-test', 'student-test', {
        clientRequestId: 'request-test',
        body: 'Catatan',
      }),
    ).rejects.toBeInstanceOf(LearningApiError);
  });
});
