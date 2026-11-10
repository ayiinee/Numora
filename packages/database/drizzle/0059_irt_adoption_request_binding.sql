ALTER TABLE public.irt_batches DROP CONSTRAINT irt_batches_source_request_id_fkey;
ALTER TABLE public.irt_batches ADD CONSTRAINT irt_batches_source_request_id_fkey
 FOREIGN KEY(source_request_id) REFERENCES public.irt_calibration_requests_v1(id) ON DELETE RESTRICT;
