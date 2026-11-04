-- National Insurance for sole traders and employers, entered by hand in the money book.
--   ni_self_employed: the owner's own Class 2 / Class 4 National Insurance. Personal, so it is not a
--     business cost and sits with tax paid, outside profit. Administrators only.
--   employer_ni: employer's National Insurance on wages. A real cost of employing people, so it is
--     counted in profit. Administrators only, like wages.
--   tax_paye_ni is relabelled: it is the PAYE income tax and employee NI withheld from pay and
--     paid over to HMRC, which is not an extra cost on top of gross wages.
-- Nothing here calculates or files anything: the amount is whatever the person types.
insert into public.money_categories (code, label, direction, grp, regulated, admin_only, sort) values
  ('employer_ni',      'Employer''s National Insurance',                       'out', 'People',            true, true, 23),
  ('ni_self_employed', 'National Insurance, self-employed (Class 2 / Class 4)', 'out', 'Tax and regulated', true, true, 36)
on conflict (code) do nothing;
update public.money_categories
   set label = 'PAYE and employee National Insurance paid to HMRC'
 where code = 'tax_paye_ni';
