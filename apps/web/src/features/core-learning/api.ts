import type {
  Catalog,
  ChapterDetail,
  DrillAttempt,
  DrillResult,
  StudentProgress,
  SubchapterDetail,
  TryoutAttempt,
  TryoutPackage,
  TryoutResult,
  AssessmentHistory,
} from './types';
import type {
  StudentDashboardDto,
  SavedAnswerDto,
  MediaLinksDto,
  StudentQuestionReportDto,
  StudentVideoReportDto,
  StudentVideosDto,
  TryoutSubmitDto,
} from './generated-types';

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export class LearningApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null = null,
  ) {
    super(message);
  }
}

export async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new LearningApiError('Koneksi terputus. Periksa jaringan lalu coba lagi.', 0);
  }

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as {
      detail?: string;
      title?: string;
      code?: string;
    } | null;
    throw new LearningApiError(
      response.status >= 500
        ? 'Layanan sedang bermasalah. Coba lagi nanti.'
        : (problem?.detail ?? problem?.title ?? 'Permintaan belum berhasil. Coba lagi.'),
      response.status,
      problem?.code ?? null,
    );
  }
  return (await response.json()) as T;
}

const id = encodeURIComponent;

export const learningApi = {
  saveContentAnswer: (
    token: string,
    attemptId: string,
    questionInstanceId: string,
    answer: SavedAnswerDto['answer'],
    kind: 'drill' | 'tryout',
  ) =>
    request<SavedAnswerDto>(
      token,
      `${kind === 'drill' ? '/assessment-attempts' : '/tryout/attempts'}/${id(attemptId)}/answers/${id(questionInstanceId)}`,
      { method: 'PATCH', body: JSON.stringify({ answer }) },
    ),
  media: (
    token: string,
    attemptId: string,
    instanceId: string,
    phase: 'WORK' | 'REVIEW',
    assetIds: string[],
  ) =>
    request<MediaLinksDto>(token, `/assessment-attempts/${id(attemptId)}/media`, {
      method: 'POST',
      body: JSON.stringify({ instanceId, phase, assetIds }),
    }),
  dashboard: (token: string) => request<StudentDashboardDto>(token, '/students/me/dashboard'),
  catalog: (token: string) => request<Catalog>(token, '/chapters'),
  chapter: (token: string, chapterId: string) =>
    request<ChapterDetail>(token, `/chapters/${id(chapterId)}`),
  subchapter: (token: string, subchapterId: string) =>
    request<SubchapterDetail>(token, `/subchapters/${id(subchapterId)}`),
  progress: (token: string) => request<StudentProgress>(token, '/students/me/progress'),
  start: (token: string, levelId: string) =>
    request<DrillAttempt>(token, '/assessments/drill/attempts', {
      method: 'POST',
      body: JSON.stringify({ levelId }),
    }),
  attempt: (token: string, attemptId: string) =>
    request<DrillAttempt>(token, `/assessment-attempts/${id(attemptId)}`),
  saveAnswer: (
    token: string,
    attemptId: string,
    questionInstanceId: string,
    optionId: string | null,
  ) =>
    request<{ questionInstanceId: string; selectedOptionId: string | null }>(
      token,
      `/assessment-attempts/${id(attemptId)}/answers/${id(questionInstanceId)}`,
      { method: 'PATCH', body: JSON.stringify({ optionId }) },
    ),
  submit: (token: string, attemptId: string) =>
    request<DrillResult>(token, `/assessment-attempts/${id(attemptId)}/submit`, {
      method: 'POST',
    }),
  result: (token: string, attemptId: string) =>
    request<DrillResult>(token, `/assessment-attempts/${id(attemptId)}/result`),
  currentTryout: (token: string) => request<TryoutPackage>(token, '/tryout/packages/current'),
  startTryout: (token: string, packageId: string) =>
    request<TryoutAttempt>(token, '/tryout/attempts', {
      method: 'POST',
      body: JSON.stringify({ packageId }),
    }),
  tryoutAttempt: (token: string, attemptId: string) =>
    request<TryoutAttempt>(token, `/tryout/attempts/${id(attemptId)}`),
  saveTryoutAnswer: (
    token: string,
    attemptId: string,
    questionInstanceId: string,
    optionId: string | null,
  ) =>
    request<{ questionInstanceId: string; selectedOptionId: string | null }>(
      token,
      `/tryout/attempts/${id(attemptId)}/answers/${id(questionInstanceId)}`,
      { method: 'PATCH', body: JSON.stringify({ optionId }) },
    ),
  submitTryout: (token: string, attemptId: string) =>
    request<TryoutSubmitDto>(token, `/tryout/attempts/${id(attemptId)}/submit`, {
      method: 'POST',
    }),
  tryoutResult: (token: string, attemptId: string) =>
    request<TryoutResult>(token, `/tryout/attempts/${id(attemptId)}/result`),
  assessmentHistory: (token: string, cursor?: string, levelId?: string) =>
    request<AssessmentHistory>(
      token,
      `/students/me/assessment-results${
        cursor || levelId
          ? `?${[cursor ? `cursor=${id(cursor)}` : '', levelId ? `levelId=${id(levelId)}` : '']
              .filter(Boolean)
              .join('&')}`
          : ''
      }`,
    ),
  videos: (token: string, attemptId: string) =>
    request<StudentVideosDto>(token, `/students/me/drill-attempts/${id(attemptId)}/videos`),
  reportQuestion: (token: string, body: StudentQuestionReportDto) =>
    request<{ id: string }>(token, '/students/me/question-reports', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reportVideo: (token: string, body: StudentVideoReportDto) =>
    request<{ id: string }>(token, '/students/me/video-reports', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
