-- Additive tenant-integrity constraints for studies, media, and comments.
-- Existing rows are intentionally checked by a separate audit before validation.
-- Do not run hosted without the approved backup/audit process.

alter table studies
  add constraint studies_org_id_id_key unique (org_id, id);
alter table comments
  add constraint comments_org_id_id_key unique (org_id, id);

alter table media_assets drop constraint if exists media_assets_study_id_fkey;
alter table media_assets
  add constraint media_assets_study_same_org_fk
  foreign key (org_id, study_id) references studies (org_id, id) not valid;

alter table comments drop constraint if exists comments_study_id_fkey;
alter table comments drop constraint if exists comments_parent_id_fkey;
alter table comments
  add constraint comments_study_same_org_fk
  foreign key (org_id, study_id) references studies (org_id, id) not valid;
alter table comments
  add constraint comments_parent_same_org_fk
  foreign key (org_id, parent_id) references comments (org_id, id) not valid;
