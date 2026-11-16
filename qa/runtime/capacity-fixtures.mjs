import { randomUUID } from 'node:crypto';
import { countsFor, workload } from '../../scripts/qa/capacity/config.mjs';

const subroles = ['SUPER_ADMIN', 'OPERATIONS', 'CONTENT_DATA_MODERATION'];

async function addClass(client, teacher, adminId) {
  const code = randomUUID();
  return client.begin(async (tx) => {
    const [school] = await tx`
      insert into schools(code,name) values(${code},'TEST ONLY school') returning id
    `;
    const [token] = await tx`
      insert into teacher_verification_tokens(school_id,token_hash,created_by_user_id,expires_at,used_at,used_by_user_id)
      values(${school.id},${code},${adminId},now()+interval '24 hours',now(),${teacher.id}) returning id
    `;
    await tx`
      insert into teacher_school_memberships(teacher_user_id,school_id,verification_token_id)
      values(${teacher.id},${school.id},${token.id})
    `;
    const [owned] = await tx`
      insert into classes(school_id,teacher_user_id,name,join_code)
      values(${school.id},${teacher.id},'TEST ONLY class',${code}) returning id
    `;
    return { classId: owned.id, schoolId: school.id };
  });
}

/** Build fresh accounts for every phase in the already-guarded local QA runtime. */
export async function seedCapacityActors(client, actor, ids, lifecycle, adminId) {
  const create = async (role, vars, affiliation, adminRole) => {
    const record = await actor(randomUUID(), role, adminRole);
    return {
      id: record.profileId,
      token: record.session.access_token,
      vars,
      affiliation,
      adminRole,
    };
  };
  const phases = {};
  for (const phase of workload('dev', 'mixed-local')) {
    const counts = countsFor(phase, { suite: 'mixed-local', pvp: true });
    const teachers = [];
    for (let index = 0; index < counts.teacher; index++) {
      const teacher = await create('TEACHER', {});
      const owned = await addClass(client, teacher, adminId);
      teachers.push({ ...teacher, vars: owned });
    }
    const admins = [];
    for (let index = 0; index < counts.admin; index++) {
      const adminRole = subroles[index % subroles.length];
      admins.push(await create('ADMIN', {}, undefined, adminRole));
    }
    const cohorts = { teacher: teachers, admin: admins };
    let schoolIndex = 0;
    let studentIndex = 0;
    for (const role of ['drill', 'tryout', 'pretest', 'pvp', 'browse']) {
      const students = [];
      for (let index = 0; index < counts[role]; index++) {
        const school = studentIndex++ % 10 < 7;
        const teacher = school ? teachers[schoolIndex++ % teachers.length] : null;
        const vars = {
          chapterId: role === 'pretest' ? lifecycle.chapterId : ids.chapter,
          subchapterId: ids.subchapter,
          ...(role === 'drill' ? { levelId: ids.levelOne } : {}),
          ...(role === 'tryout' ? { packageId: lifecycle.tryoutPackageId } : {}),
          ...(teacher ? { classId: teacher.vars.classId } : {}),
        };
        const student = await create('STUDENT', vars, school ? 'school' : 'mandiri');
        if (teacher) {
          await client`
            insert into class_memberships(class_id,student_user_id)
            values(${teacher.vars.classId},${student.id})
          `;
          teacher.vars.studentId ??= student.id;
        }
        students.push(student);
      }
      cohorts[role] = students;
    }
    phases[phase.name] = cohorts;
  }
  return { phases };
}

export async function seedCapacityPvp(client, subchapterId, reviewerId) {
  await client.begin(async (tx) => {
    const [competency] = await tx`
      select id from competencies where subchapter_id=${subchapterId} and status='READY' limit 1
    `;
    if (!competency) throw new Error('Local PvP drill competency missing');
    const stem = { text: 'TEST ONLY: 1 + 1?' };
    const options = [
      { id: 'A', content: { text: '2' } },
      { id: 'B', content: { text: '3' } },
    ];
    for (const difficulty of ['EASY', 'MEDIUM', 'HARD']) {
      for (let index = 0; index < 10; index++) {
        const [question] = await tx`
          insert into questions(primary_competency_id,usage_type,status)
          values(${competency.id},'DRILL','READY') returning id
        `;
        const [variant] = await tx`
          insert into question_variants(question_id,variant_code,kind,origin)
          values(${question.id},${randomUUID()},'ORIGINAL','TEST') returning id
        `;
        await tx`
          insert into question_versions(
            variant_id,version_number,question_type,stem,options_or_statements,answer_key,
            explanation,difficulty,content_status,reviewed_by_user_id,reviewed_at
          ) values(
            ${variant.id},1,'SINGLE_CHOICE',${JSON.stringify(stem)}::text::jsonb,${JSON.stringify(options)}::text::jsonb,
            ${JSON.stringify({ optionId: 'A' })}::text::jsonb,${JSON.stringify({ text: 'TEST ONLY: hasilnya 2.' })}::text::jsonb,
            ${difficulty},'READY',${reviewerId},now()
          )
        `;
      }
    }
  });
}
