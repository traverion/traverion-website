import { useState } from 'react';
import { STAY_AMENITY_GROUPS, STAY_AMENITY_PRESETS, formatStayAmenityLabel, stayAmenityDisplayList } from '../../../lib/stay-amenities';
import { StayChoice, StayField } from './StayCreatorUi';
import { stayAmenityIcon } from './stay-creator-icons';

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
};

function hasAmenity(selected: string[], label: string): boolean {
  const key = formatStayAmenityLabel(label).toLowerCase();
  return stayAmenityDisplayList(selected).some((item) => item.toLowerCase() === key);
}

export default function StayAmenityPicker({ selected, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const canonical = stayAmenityDisplayList(selected);
  const presetKeys = new Set(STAY_AMENITY_PRESETS.map((label) => label.toLowerCase()));
  const customSelected = canonical.filter((item) => !presetKeys.has(item.toLowerCase()));
  const q = query.trim().toLowerCase();

  function toggle(label: string) {
    const clean = formatStayAmenityLabel(label);
    if (!clean) return;
    const current = stayAmenityDisplayList(selected);
    if (current.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      onChange(current.filter((item) => item.toLowerCase() !== clean.toLowerCase()));
      return;
    }
    onChange([...current, clean]);
  }

  const visibleGroups = STAY_AMENITY_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((label) => !q || label.toLowerCase().includes(q)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="stay-creator space-y-5">
      <StayField label="Search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} className="tv-input w-full" placeholder="Wifi, sauna, parking" aria-label="Search amenities" />
      </StayField>
      {visibleGroups.length === 0 ? <p className="stay-help">No amenities match.</p> : null}
      {visibleGroups.map((group) => (
        <section key={group.label} className="space-y-2">
          <h4 className="stay-kicker">{group.label}</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.items.map((label) => {
              const on = hasAmenity(selected, label);
              const icon = stayAmenityIcon(label);
              return (
                <StayChoice key={label} pressed={on} icon={icon ?? undefined} onClick={() => toggle(label)}>
                  {label === 'Wifi' ? 'Wi-Fi' : label}
                </StayChoice>
              );
            })}
          </div>
        </section>
      ))}
      {customSelected.length > 0 ? (
        <section className="space-y-2">
          <h4 className="stay-kicker">Also selected</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {customSelected.map((item) => (
              <StayChoice key={item} pressed onClick={() => toggle(item)}>{item}</StayChoice>
            ))}
          </div>
        </section>
      ) : null}
      <StayField label="Your own amenity">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value.slice(0, 40))}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const next = custom.trim();
            if (!next || hasAmenity(selected, next)) {
              setCustom('');
              return;
            }
            toggle(next);
            setCustom('');
          }}
          className="tv-input w-full"
          placeholder="Only something that is actually there"
          maxLength={40}
          aria-label="Custom amenity"
        />
      </StayField>
      <p className="stay-help">Press Enter to add your own amenity. Select a tile again to remove it.</p>
    </div>
  );
}
