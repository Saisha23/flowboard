-- Phase 2: allow workspace teammates to read each other's profile fields.

drop policy if exists "profiles_select_workspace_member" on public.profiles;
create policy "profiles_select_workspace_member"
on public.profiles for select to authenticated
using (
  exists (
    select 1
    from public.workspace_members self_membership
    join public.workspace_members profile_membership
      on profile_membership.workspace_id = self_membership.workspace_id
    where self_membership.user_id = auth.uid()
      and profile_membership.user_id = profiles.id
  )
);
