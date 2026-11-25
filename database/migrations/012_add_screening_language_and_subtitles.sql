BEGIN;

ALTER TABLE public.screenings
ADD COLUMN spoken_language VARCHAR(35);

ALTER TABLE public.screenings
ADD COLUMN subtitles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMIT;