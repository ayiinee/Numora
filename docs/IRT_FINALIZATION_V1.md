# IRT Finalization v1

Finalizer riset menyusun keputusan per attempt dari artifact yang sudah diadopsi. Jalur ini hanya menulis staging `irt_finalization_*_v1`; tidak menerbitkan hasil, menulis XP, mengubah attempt, atau mengubah histori.

## Endpoint

`POST /api/v1/admin/irt/research/finalize/{receiptId}`

`receiptId` harus berstatus `ADOPTED`. Request idempoten: pengulangan receipt mengembalikan run yang sama. Artifact atau receipt yang belum diadopsi ditolak.

## Keputusan

- `SCORED` dengan score, theta, dan standard error finite menghasilkan `IRT`.
- `UNSCORABLE`, `INSUFFICIENT`, dan `NOT_COMPARABLE` dipertahankan dengan nilai null.
- Fallback tidak dibuat otomatis; policy fallback eksplisit diperlukan pada tahap rilis berikutnya.
- Coverage attempt harus lengkap dari receipt adoption.

Status `READY` berarti staging finalization selesai, bukan publikasi siswa atau kelulusan scientific gate.
