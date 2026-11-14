/** Display only: retain persisted decimals and never use this to determine rewards/mastery. */
export const formatStudentNumber = (value: number) =>
  value.toLocaleString('id-ID', { maximumFractionDigits: 6 });
