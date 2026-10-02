-- Allow every active organization member to submit internal feedback.
-- Inbox viewing and request management remain restricted by app permissions.

drop policy if exists feature_requests_insert on feature_requests;
create policy feature_requests_insert on feature_requests for insert to authenticated
  with check (
    created_by = auth.uid() and exists (
      select 1 from memberships m join users u on u.id = m.user_id
      where m.org_id = feature_requests.org_id and m.user_id = auth.uid()
        and m.deactivated_at is null and u.is_active
    )
  );

drop policy if exists feature_request_events_insert on feature_request_events;
create policy feature_request_events_insert on feature_request_events for insert to authenticated
  with check (
    actor_user_id = auth.uid() and exists (
      select 1 from memberships m join users u on u.id = m.user_id
      where m.org_id = feature_request_events.org_id and m.user_id = auth.uid()
        and m.deactivated_at is null and u.is_active
    )
  );
