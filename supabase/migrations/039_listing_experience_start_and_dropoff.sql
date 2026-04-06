-- How the experience begins (supplier picker) and drop-off relative to pickup/meeting.
alter table public.listings
  add column if not exists experience_start_style text
    check (
      experience_start_style is null
      or experience_start_style in (
        'unspecified',
        'fixed_meeting_place',
        'operator_pickup',
        'either_available'
      )
    ),
  add column if not exists dropoff_mode text
    check (
      dropoff_mode is null
      or dropoff_mode in ('same_as_pickup', 'different_place')
    ),
  add column if not exists dropoff_location text;

comment on column public.listings.experience_start_style is 'How guests begin: meet at place, operator pickup, either, or unspecified.';
comment on column public.listings.dropoff_mode is 'Whether drop-off matches pickup/meeting or a different place.';
comment on column public.listings.dropoff_location is 'When dropoff_mode = different_place, where the experience ends for guests.';
