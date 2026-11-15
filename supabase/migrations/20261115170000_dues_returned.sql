-- A returned direct debit (Rücklastschrift) / failed payment: the due is open again (still owed, so every "open" and
-- "overdue" sum stays right) and remembers when the payment failed.
alter table public.member_dues add column failed_at timestamptz;
