-- Pujo Secret Society: invitation-code setup
-- Run in Supabase SQL Editor. This checks the existing format constraint and creates
-- one unique 10-character uppercase hexadecimal code for each APPROVED application
-- that does not already have a code.

-- 1) Confirm the existing constraint accepts exactly 10 uppercase hex characters:
-- CHECK (code ~ '^[A-F0-9]{10}$')

-- 2) Generate codes only after you have reviewed applicants and set applications.status='approved'.
-- Safe to run more than once: applications that already have a code are skipped.
INSERT INTO public.invitation_codes (application_id, code, status)
SELECT a.id, candidate.code, 'active'
FROM public.applications AS a
CROSS JOIN LATERAL (
  SELECT upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 10)) AS code
) AS candidate
WHERE lower(coalesce(a.status, '')) = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM public.invitation_codes AS i WHERE i.application_id = a.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.invitation_codes AS prior WHERE prior.code = candidate.code
  );

-- 3) View the issued codes for host-side distribution. Keep this query private.
SELECT a.name, a.partner, a.email, i.code, i.status
FROM public.applications a
JOIN public.invitation_codes i ON i.application_id = a.id
ORDER BY a.created_at DESC;
