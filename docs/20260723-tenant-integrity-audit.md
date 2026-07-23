# Tenant-integrity audit

Migration 20260723000011_tenant_integrity_constraints.sql adds same-tenant
foreign keys as NOT VALID. This is deliberate: existing rows must be audited
before PostgreSQL validates them.

## Local or staging audit

Run these read-only queries with the database manager connection:

~~~
select count(*) as cross_org_media
from media_assets m
join studies s on s.id = m.study_id
where m.org_id <> s.org_id;

select count(*) as cross_org_comments
from comments c
join studies s on s.id = c.study_id
where c.org_id <> s.org_id;

select count(*) as cross_org_comment_parents
from comments child
join comments parent on parent.id = child.parent_id
where child.org_id <> parent.org_id;
~~~

Expected result: all three counts are 0.

After backup and review, validate constraints:

~~~
alter table media_assets validate constraint media_assets_study_same_org_fk;
alter table comments validate constraint comments_study_same_org_fk;
alter table comments validate constraint comments_parent_same_org_fk;
alter table recruitment_pages validate constraint recruitment_pages_workspace_same_org_fk;
alter table recruitment_page_questions validate constraint recruitment_page_questions_page_same_org_fk;
alter table recruitment_page_questions validate constraint recruitment_page_questions_field_same_org_fk;
alter table recruitment_submissions validate constraint recruitment_submissions_page_same_org_fk;
alter table recruitment_submissions validate constraint recruitment_submissions_panelist_same_org_fk;
~~~

Rollback requires dropping the new constraints and restoring the previous
single-column study foreign keys. Do not drop data as part of rollback.
