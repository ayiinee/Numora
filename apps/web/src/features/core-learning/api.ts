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
  StudentQuestionReportDto,
  StudentVideoReportDto,
  StudentVideosDto,
  TryoutSubmitDto,
  PretestAttemptDto, PretestChapterDto, PretestResultDto, PretestSavedAnswerDto,
  TryoutPackagesDto, TryoutPackageDto,
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

import type { AssessmentAnswer } from './assessment-answers';
import type { SavedAnswerDto } from './generated-types';
const id = encodeURIComponent;

export const learningApi = {
  pretestChapter: (token: string, chapterId: string) => request<PretestChapterDto>(token, `/pretest/chapters/${id(chapterId)}`),
  startPretest: (token: string, chapterId: string) => request<PretestAttemptDto>(token, '/pretest/attempts', { method: 'POST', body: JSON.stringify({ chapterId }) }),
  skipPretest: (token: string, chapterId: string) => request<PretestChapterDto>(token, `/pretest/chapters/${id(chapterId)}/skip`, { method: 'POST' }),
  pretestAttempt: (token: string, attemptId: string) => request<PretestAttemptDto>(token, `/pretest/attempts/${id(attemptId)}`),
  savePretestAnswer: (token: string, attemptId: string, questionId: string, answer: AssessmentAnswer, expectedRevision: number) => request<PretestSavedAnswerDto>(token, `/pretest/attempts/${id(attemptId)}/answers/${id(questionId)}`, { method: 'PATCH', body: JSON.stringify({ answer, expectedRevision }) }),
  submitPretest: (token: string, attemptId: string) => request<PretestResultDto>(token, `/pretest/attempts/${id(attemptId)}/submit`, { method: 'POST' }),
  pretestResult: (token: string, attemptId: string) => request<PretestResultDto>(token, `/pretest/attempts/${id(attemptId)}/result`),
  tryoutPackages: (token: string, cursor?: string) => request<TryoutPackagesDto>(token, `/tryout/packages${cursor ? `?cursor=${id(cursor)}` : ''}`),
  tryoutPackage: (token: string, packageId: string) => request<TryoutPackageDto>(token, `/tryout/packages/${id(packageId)}`),
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
    answer: string | AssessmentAnswer,
  ) =>
    request<SavedAnswerDto>(
      token,
      `/assessment-attempts/${id(attemptId)}/answers/${id(questionInstanceId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(
          typeof answer === 'string' || answer === null ? { optionId: answer } : { answer },
        ),
      },
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
    answer: string | AssessmentAnswer,
  ) =>
    request<SavedAnswerDto>(
      token,
      `/tryout/attempts/${id(attemptId)}/answers/${id(questionInstanceId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(
          typeof answer === 'string' || answer === null ? { optionId: answer } : { answer },
        ),
      },
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
