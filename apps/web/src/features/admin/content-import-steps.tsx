export const importSteps = ['Upload Excel', 'Preview & tujuan', 'Pemetaan & validasi', 'Publish'];
export function ContentImportSteps({ step }: { step: number }) {
  return (
    <ol className="upload-steps" aria-label="Langkah upload">
      {importSteps.map((label, n) => (
        <li key={label} aria-current={step === n + 1 ? 'step' : undefined}>
          <span>{n + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
