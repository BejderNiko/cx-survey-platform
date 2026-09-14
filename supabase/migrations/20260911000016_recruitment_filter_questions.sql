-- Allow recruitment pages to ask native panel-filter questions.
-- Authoring this migration does not authorize running it against any database.

alter table recruitment_page_questions
  alter column custom_field_id drop not null,
  add column if not exists source_key text;

alter table recruitment_page_questions
  add constraint recruitment_page_questions_source_shape check (
    custom_field_id is not null or source_key is not null
  ) not valid;

create unique index if not exists recruitment_page_questions_source_uidx
  on recruitment_page_questions (recruitment_page_id, source_key)
  where source_key is not null;
