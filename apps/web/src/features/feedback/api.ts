import { request } from '../core-learning/api';
import type { AssessmentHistoryDto } from '../core-learning/generated-types';
import type {
  CreateFeedbackDto,
  FeedbackListDto,
  ReadFeedbackDto,
} from '@/lib/generated-api-types';

export const FEEDBACK_PAGE_SIZE = 20;
export const FEEDBACK_BODY_MAX_LENGTH = 1000;

const enc = encodeURIComponent;
const page = `limit=${FEEDBACK_PAGE_SIZE}&offset=`;
const owned = (classId: string, studentId: string) =>
  `classes/${enc(classId)}/students/${enc(studentId)}`;

export const feedbackApi = {
  send: (token: string, classId: string, studentId: string, body: CreateFeedbackDto) =>
    request<{ id: string }>(token, `/${owned(classId, studentId)}/feedback`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  teacherList: (token: string, classId: string, studentId: string, offset: number) =>
    request<FeedbackListDto>(token, `/${owned(classId, studentId)}/feedback?${page}${offset}`),
  teacherHistory: (token: string, classId: string, studentId: string, cursor?: string) =>
    request<AssessmentHistoryDto>(
      token,
      `/${owned(classId, studentId)}/assessment-results${cursor ? `?cursor=${enc(cursor)}` : ''}`,
    ),
  studentList: (token: string, offset: number) =>
    request<FeedbackListDto>(token, `/students/me/feedback?${page}${offset}`),
  markRead: (token: string, feedbackId: string) =>
    request<ReadFeedbackDto>(token, `/students/me/feedback/${enc(feedbackId)}/read`, {
      method: 'POST',
    }),
};
