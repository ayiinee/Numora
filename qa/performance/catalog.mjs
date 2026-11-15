export const identity = 'GET /api/v1/identity/me';

export const readJourneys = {
  browse: [
    'GET /',
    'GET /api/v1/students/me/dashboard',
    'GET /api/v1/students/me/materials',
    'GET /api/v1/chapters/{chapterId}',
    'GET /api/v1/subchapters/{subchapterId}',
    'GET /api/v1/students/me/progress',
    'GET /api/v1/students/me/assessment-results',
    'GET /api/v1/students/me/notifications',
    'GET /api/v1/students/me/feedback',
    'GET /api/v1/leaderboards/activity',
  ],
  school: ['GET /api/v1/leaderboards/class?classId={classId}'],
  drill: ['GET /api/v1/subchapters/{subchapterId}'],
  tryout: ['GET /api/v1/tryout/batches', 'GET /api/v1/tryout/packages/current'],
  pretest: ['GET /api/v1/pretest/chapters/{chapterId}'],
  pvp: ['GET /api/v1/pvp/availability', 'GET /api/v1/leaderboards/pvp'],
  teacher: [
    'GET /api/v1/classes',
    'GET /api/v1/classes/{classId}/students',
    'GET /api/v1/classes/{classId}/students/{studentId}/progress',
    'GET /api/v1/classes/{classId}/students/{studentId}/assessment-results',
  ],
  admin: ['GET /api/v1/admin/dashboard'],
};

export const assessments = {
  drill: {
    count: 10,
    start: 'POST /api/v1/assessments/drill/attempts',
    parameter: 'levelId',
    path: '/api/v1/assessment-attempts/{attemptId}',
  },
  tryout: {
    count: 30,
    start: 'POST /api/v1/tryout/batches/{batchId}/attempts',
    path: '/api/v1/tryout/attempts/{attemptId}',
  },
  pretest: {
    count: 20,
    start: 'POST /api/v1/pretest/attempts',
    parameter: 'chapterId',
    path: '/api/v1/pretest/attempts/{attemptId}',
  },
};

export const assessmentOperations = (name) => {
  const { start, path } = assessments[name];
  return [
    start,
    'GET ' + path,
    'PATCH ' + path + '/answers/{questionInstanceId}',
    'POST ' + path + '/submit',
    'GET ' + path + '/result',
  ];
};

export const publicAssets = 'GET /_next/static/*';
export const productionReads = new Set([
  identity,
  publicAssets,
  ...Object.values(readJourneys).flat(),
]);
export const drillClock = 'PATCH /api/v1/assessment-attempts/{attemptId}/drill-clock';
export const productionWrites = new Set([
  drillClock,
  ...Object.keys(assessments).flatMap(assessmentOperations),
]);

export const statGroup = (operation) =>
  operation.startsWith('GET ') ? 'read' : operation.endsWith('/submit') ? 'submit' : 'write';
