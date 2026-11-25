BEGIN;

ALTER TABLE public.screenings
ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'scheduled';

ALTER TABLE public.screenings
ADD CONSTRAINT chk_screenings_status
CHECK (status IN ('scheduled', 'cancelled'));

CREATE INDEX idx_screenings_status
ON public.screenings (status);

COMMIT;