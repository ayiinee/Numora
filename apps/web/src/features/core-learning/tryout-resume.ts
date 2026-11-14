type TryoutResume = { questionId: string; flagged: string[] };

export function tryoutResumeKey(studentId: string, attemptId: string) {
  return `numora:tryout:${studentId}:${attemptId}`;
}

export function readTryoutResume(key: string, questionIds: string[], expired: boolean) {
  if (expired) return undefined;
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<TryoutResume> | null;
    if (
      !value?.questionId ||
      !questionIds.includes(value.questionId) ||
      !Array.isArray(value.flagged)
    )
      return undefined;
    return {
      questionId: value.questionId,
      flagged: value.flagged.filter((id) => questionIds.includes(id)),
    };
  } catch {
    return undefined;
  }
}

export function writeTryoutResume(key: string, value?: TryoutResume) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // The session can continue with server data when browser storage is unavailable.
  }
}
