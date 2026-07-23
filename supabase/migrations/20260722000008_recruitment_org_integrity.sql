-- Enforce tenant consistency across recruitment foreign-key relationships.
-- Existing rows are intentionally left unvalidated until a data audit is complete;
-- validate each NOT VALID constraint after confirming no cross-org rows exist.

alter table workspaces
  add constraint workspaces_org_id_id_key unique (org_id, id);
alter table custom_fields
  add constraint custom_fields_org_id_id_key unique (org_id, id);
alter table panelists
  add constraint panelists_org_id_id_key unique (org_id, id);
alter table recruitment_pages
  add constraint recruitment_pages_org_id_id_key unique (org_id, id);

alter table recruitment_pages
  add constraint recruitment_pages_workspace_same_org_fk
  foreign key (org_id, workspace_id) references workspaces (org_id, id) not valid;

alter table recruitment_page_questions
  add constraint recruitment_page_questions_page_same_org_fk
  foreign key (org_id, recruitment_page_id) references recruitment_pages (org_id, id) not valid;
alter table recruitment_page_questions
  add constraint recruitment_page_questions_field_same_org_fk
  foreign key (org_id, custom_field_id) references custom_fields (org_id, id) not valid;

alter table recruitment_submissions
  add constraint recruitment_submissions_page_same_org_fk
  foreign key (org_id, recruitment_page_id) references recruitment_pages (org_id, id) not valid;
alter table recruitment_submissions
  add constraint recruitment_submissions_panelist_same_org_fk
  foreign key (org_id, panelist_id) references panelists (org_id, id) not valid;

-- After data audit, run VALIDATE CONSTRAINT for each constraint above.