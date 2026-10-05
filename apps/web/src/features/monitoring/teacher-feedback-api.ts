import { apiRequest } from '@/lib/api';
import type { CreateFeedbackDto, FeedbackListDto } from '@/lib/generated-api-types';
import type { ContentMutationDto } from '@/features/admin/generated-types';

function feedbackPath(classId: string, studentId: string) {
  return `classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/feedback`;
}
export const getTeacherFeedback = (token: string, classId: string, studentId: string, offset = 0) =>
  apiRequest<FeedbackListDto>(
    `${feedbackPath(classId, studentId)}?limit=20&offset=${offset}`,
    token,
  );
export const sendTeacherFeedback = (
  token: string,
  classId: string,
  studentId: string,
  input: CreateFeedbackDto,
) =>
  apiRequest<ContentMutationDto>(feedbackPath(classId, studentId), token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
