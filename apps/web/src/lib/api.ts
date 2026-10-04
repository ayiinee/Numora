import type {
  IdentityProfileDto,
  ClassSummaryDto,
  StudentSummaryDto,
  ClassesResponseDto,
  ClassStudentsResponseDto,
  SchoolDto,
  TeacherStudentProgressDto,
  AdminSchoolDto,
  TokenSummaryDto,
  TokenDto,
  SchoolListDto,
  VerifiedDto,
  CreatedClassDto,
  JoinedClassDto,
  AdminSchoolsDto,
  TokenListDto,
  RevokedDto,
  UpdateSchoolDto,
} from './generated-api-types';

export type HealthResponse = {
  status: 'ok';
  service: string;
  timestamp: string;
  version: string;
};

const fallbackBaseUrl = 'http://localhost:3001/api/v1';

export type IdentityProfile = IdentityProfileDto;

export class ApiProblem extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? fallbackBaseUrl;
  if (process.env.NODE_ENV === 'development') {
    console.debug('[NUMORA API REQUEST]', {
      path,
      method: options?.method ?? 'GET',
      hasToken: Boolean(token),
    });
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/${path}`, {
      ...options,
      headers: {
        ...(options?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
  } catch {
    throw new ApiProblem(0, 'NETWORK_ERROR', 'Koneksi ke server gagal. Coba lagi.');
  }
  const body = (await response.json().catch(() => null)) as
    { code?: string; detail?: string } | T | null;
  if (!response.ok) {
    const problem = body as { code?: string; detail?: string } | null;
    throw new ApiProblem(
      response.status,
      problem?.code ?? 'API_ERROR',
      problem?.detail ?? 'Permintaan gagal. Coba lagi.',
    );
  }
  return body as T;
}

export const getIdentity = (token: string) => apiRequest<IdentityProfile>('identity/me', token);
export const registerIdentity = (token: string, role: 'STUDENT' | 'TEACHER') =>
  apiRequest<IdentityProfile>('identity/me', token, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });

export type ClassSummary = ClassSummaryDto;
export type StudentSummary = StudentSummaryDto;
export type ClassesResponse = ClassesResponseDto;
export type ClassStudentsResponse = ClassStudentsResponseDto;
export type SchoolSummary = SchoolDto;
export type TeacherStudentProgress = TeacherStudentProgressDto;

export const getSchools = (token: string) => apiRequest<SchoolListDto>('schools', token);
export const verifyTeacher = (token: string, schoolId: string, verificationToken: string) =>
  apiRequest<VerifiedDto>(`schools/${encodeURIComponent(schoolId)}/teacher-verifications`, token, {
    method: 'POST',
    body: JSON.stringify({ token: verificationToken }),
  });

export const getTeacherClasses = (token: string) => apiRequest<ClassesResponse>('classes', token);
export const createTeacherClass = (token: string, name: string) =>
  apiRequest<CreatedClassDto>('classes', token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
export const joinClass = (token: string, joinCode: string) =>
  apiRequest<JoinedClassDto>('classes/join', token, {
    method: 'POST',
    body: JSON.stringify({ joinCode }),
  });
export const getClassStudents = (token: string, classId: string) =>
  apiRequest<ClassStudentsResponse>(`classes/${encodeURIComponent(classId)}/students`, token);
export const getTeacherStudentProgress = (token: string, classId: string, studentId: string) =>
  apiRequest<TeacherStudentProgress>(
    `classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/progress`,
    token,
  );

export type AdminSchool = AdminSchoolDto;
export type TeacherTokenSummary = TokenSummaryDto;
export type IssuedTeacherToken = TokenDto;
export const listAdminSchools = (token: string) =>
  apiRequest<AdminSchoolsDto>('admin/schools', token);
export const createSchool = (token: string, code: string, name: string) =>
  apiRequest<AdminSchool>('admin/schools', token, {
    method: 'POST',
    body: JSON.stringify({ code, name }),
  });
export const updateSchool = (token: string, schoolId: string, input: UpdateSchoolDto) =>
  apiRequest<AdminSchool>(`admin/schools/${encodeURIComponent(schoolId)}`, token, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
export const listTeacherTokens = (token: string, schoolId: string) =>
  apiRequest<TokenListDto>(`admin/schools/${encodeURIComponent(schoolId)}/teacher-tokens`, token);
export const issueTeacherToken = (token: string, schoolId: string) =>
  apiRequest<IssuedTeacherToken>(
    `admin/schools/${encodeURIComponent(schoolId)}/teacher-tokens`,
    token,
    { method: 'POST' },
  );
export const reissueTeacherToken = (token: string, schoolId: string, tokenId: string) =>
  apiRequest<IssuedTeacherToken>(
    `admin/schools/${encodeURIComponent(schoolId)}/teacher-tokens/${encodeURIComponent(tokenId)}/reissue`,
    token,
    { method: 'POST' },
  );
export const revokeTeacherToken = (token: string, schoolId: string, tokenId: string) =>
  apiRequest<RevokedDto>(
    `admin/schools/${encodeURIComponent(schoolId)}/teacher-tokens/${encodeURIComponent(tokenId)}/revoke`,
    token,
    { method: 'POST' },
  );

export async function getApiHealth(): Promise<HealthResponse | null> {
  const baseUrl =
    process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? fallbackBaseUrl;

  try {
    const response = await fetch(`${baseUrl}/health`, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as HealthResponse;
  } catch {
    return null;
  }
}
