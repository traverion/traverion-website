import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('tour option creation overhaul (source contracts)', () => {
  const css = read('../../../index.css');

  it('applies choice-card selected borders in the option shell and schedule workspace', () => {
    expect(css).toMatch(/\.listing-creation-option-shell \.lc-choice--selected/);
    expect(css).toMatch(/\.listing-creation-schedule-workspace \.lc-choice--selected/);
  });

  it('shares lc-section / lc-tile styling outside .listing-creation-workspace', () => {
    expect(css).toMatch(/:is\(\.listing-creation-workspace, \.listing-creation-option-shell[^)]*\) \.lc-section/);
    expect(css).toMatch(/:is\(\.listing-creation-workspace, \.listing-creation-option-shell[^)]*\) \.lc-tile/);
  });

  it('keeps the schedule layer fixed above the creation shell (z-80)', () => {
    const block = css.slice(css.indexOf('.listing-creation-schedule-layer {'));
    expect(block.slice(0, 200)).toContain('position: fixed');
    expect(block.slice(0, 200)).toMatch(/z-index: (9\d|1\d\d)/);
  });

  it('portals a fullscreen schedule workspace matching the option editor shell', () => {
    const src = read('TourScheduleWorkspace.tsx');
    expect(src).toContain('createPortal(layer, document.body)');
    expect(src).toContain('Back to option');
    expect(src).toContain('listing-creation-schedule-rail');
    expect(src).toContain('Finish schedule');
    expect(src).not.toContain('listing-creation-schedule-backdrop');
    expect(src).not.toContain('aria-label="Where you are"');
    expect(src).toMatch(/optionLabel|option\.name/);
    expect(css).toMatch(/\.listing-creation-schedule-workspace \{[^}]*flex-direction: row/s);
    expect(css).not.toContain('listing-creation-schedule-backdrop');
  });

  it('imports the schedule prerequisite check used by Add schedule', () => {
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    expect(form).toMatch(/import \{[^}]*bookingOptionSchedulePrereqIssues[^}]*\} from '..\/..\/lib\/listing-option-validation'/s);
    expect(form).toContain('<TourOptionCard');
  });

  it('Options overview is cards-only (no listing start/cutoff/timezone controls)', () => {
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    expect(form).toContain('Ways travelers can book this experience.');
    expect(form).not.toContain('id="supplier-listing-experience-start"');
    expect(form).not.toContain('id="supplier-booking-cutoff"');
    expect(form).not.toContain('id="supplier-departure-timezone"');
    expect(form).toContain('deriveExperienceStartStyleFromOptions');
    expect(form).toContain('listingDepartureTimezone={form.departureTimezone');
  });

  it('option scenes are setup → meeting → pricing → availability', () => {
    const progression = readFileSync(resolve(__dirname, '../../../lib/listing-option-progression.ts'), 'utf8');
    expect(progression).toMatch(/id: 'setup'/);
    expect(progression).toMatch(/id: 'meeting'/);
    expect(progression).toMatch(/id: 'pricing'/);
    expect(progression).toMatch(/id: 'availability'/);
    expect(progression).not.toMatch(/availability_pricing/);
    expect(progression).not.toMatch(/id: 'review'/);
  });

  it('Escape on the option sheet saves as draft instead of discarding', () => {
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    expect(form).toContain('saveOptionAsDraftRef');
    const escapeBlock = form.slice(form.indexOf('if (optionModalOpenRef.current)'));
    const block = escapeBlock.slice(0, escapeBlock.indexOf('return;') + 20);
    expect(block).toContain('saveOptionAsDraftRef.current()');
    expect(block).not.toContain('setOptionModalDraft(null)');
  });

  it('resolves remapped implicit schedule ids when opening Finish schedule', () => {
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    expect(form).toMatch(/import \{[^}]*isImplicitScheduleId[^}]*\} from '..\/..\/lib\/listing-option-schedules'/s);
    expect(form).toContain('isImplicitScheduleId(scheduleId)');
  });

  it('derives scene progress completeness from real readiness, not visitation', () => {
    const progress = read('ListingCreationSceneProgress.tsx');
    const basics = read('TourBasicsGuidedScenes.tsx');
    const option = read('TourOptionGuidedScenes.tsx');
    expect(progress).toContain('isComplete');
    expect(progress).not.toMatch(/const complete = i < index/);
    expect(basics).toContain('isSceneComplete={(index) => isTourBasicsSceneSatisfied(index, form)}');
    expect(option).toContain('isTourOptionSceneSatisfied');
  });

  it('hides charge-model picker on schedule pricing/capacity steps', () => {
    const editor = readFileSync(resolve(__dirname, '../BookingOptionEditor.tsx'), 'utf8');
    expect(editor).toContain('showChargeModelPicker');
    expect(editor).toMatch(/showChargeModelPicker = !activeSection \|\| activeSection === 'pricing'/);
    expect(editor).toContain('schedule_pricing');
    expect(editor).toContain('schedule_capacity');
    expect(editor).toContain('SchedulePricingEditor');
  });

  it('uses a four-step schedule wizard When → Capacity → Pricing → Review', () => {
    const wizard = readFileSync(resolve(__dirname, '../../../lib/listing-schedule-wizard.ts'), 'utf8');
    expect(wizard).toMatch(/id: 'when'/);
    expect(wizard).toMatch(/id: 'capacity'/);
    expect(wizard).toMatch(/id: 'pricing'/);
    expect(wizard).toMatch(/id: 'review'/);
    expect(wizard).not.toMatch(/price_capacity/);
  });

  it('offers Save & exit in the leave dialog for published listings', () => {
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    expect(form).toContain('leaveAndSavePublished');
    expect(form).toMatch(/form\.status === 'published'[\s\S]*Save & exit/);
    expect(form).toMatch(/Save changes before leaving\?/);
    expect(form).toMatch(/You have unsaved changes to this experience/);
    // Leave-save must reuse publish save — never invent a draft→published path from leave.
    expect(form).toMatch(
      /leaveAndSavePublished[\s\S]*form\.status !== 'published'[\s\S]*runSubmit\('published'/
    );
    expect(form).toMatch(/runSubmit\('published', \{ bypassLastStepArm: true, closeOnSuccess: true \}/);
  });

  it('syncs local status after save and never force-drafts a published listing on hide', () => {
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    expect(form).toMatch(/status: targetStatus/);
    expect(form).toMatch(/setSaveFlash\(targetStatus === 'published' \? 'published' : 'draft'\)/);
    expect(form).toMatch(/form\.status === 'published'[\s\S]*status: 'published'/);
    expect(form).toMatch(/bg-white[\s\S]*Save changes before leaving/);
  });

  it('guards Save schedule against rapid double clicks', () => {
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    expect(form).toContain('scheduleSaveLockRef');
    expect(form).toMatch(/saveScheduleReady[\s\S]*scheduleSaveLockRef\.current/);
  });

  it('uses a full-screen portaled editor with a left step rail and no modal backdrop', () => {
    const src = read('TourOptionWorkspace.tsx');
    expect(src).toContain('Back to options');
    expect(src).toContain('createPortal');
    expect(src).toContain('listing-creation-option-rail');
    expect(src).toContain('modeTitle');
    expect(src).toContain('New option');
    expect(src).toContain('listing-creation-option-header');
    expect(src).not.toContain('listing-creation-option-backdrop');
    expect(src).not.toContain('aria-label="Where you are"');
    expect(css).toMatch(/\.listing-creation-option-layer \{[^}]*position: fixed/s);
    expect(css).toMatch(/\.listing-creation-option-shell \{[^}]*flex-direction: row/s);
    expect(css).not.toContain('listing-creation-option-backdrop');
  });

  it('stacks the option editor above the listing shell and below the schedule layer', () => {
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    // Listing wizard shell — regression: option layer used to sit at z-70 and open behind this.
    expect(form).toMatch(/fixed inset-0 z-\[80\]/);
    const optionBlock = css.slice(css.indexOf('.listing-creation-option-layer {'));
    expect(optionBlock.slice(0, 220)).toMatch(/z-index:\s*90/);
    const scheduleBlock = css.slice(css.indexOf('.listing-creation-schedule-layer {'));
    expect(scheduleBlock.slice(0, 200)).toMatch(/z-index:\s*95/);
  });

  it('wires Add option and Edit to openOptionModalCreate / openOptionModalEdit', () => {
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    const card = read('TourOptionCard.tsx');
    expect(form).toContain('onClick={() => openOptionModalCreate()}');
    expect(form).toContain('onEdit={() => openOptionModalEdit(opt.id)}');
    expect(form).toContain('setOptionModalOpen(true)');
    expect(form).toContain('createEmptyBookingOption()');
    expect(form).toContain('<TourOptionWorkspace');
    expect(form).toContain('tourOptionGuided && optionModalDraft');
    expect(card).toContain('onClick={onEdit}');
    expect(card).toContain('onClick={onDuplicate}');
    expect(card).toContain('onClick={onRequestDelete}');
    expect(card).toContain('onClick={onPrimary}');
  });

  it('keeps five option scenes with Booking settings separated from Availability', () => {
    const progression = readFileSync(
      resolve(__dirname, '../../../lib/listing-option-progression.ts'),
      'utf8'
    );
    const guided = read('TourOptionGuidedScenes.tsx');
    expect(progression).toContain("id: 'booking_settings'");
    expect(progression).toContain("question: 'What are you offering?'");
    expect(progression).toContain("question: 'When can guests book?'");
    expect(progression).toContain("question: 'Booking cutoff and timezone'");
    expect(guided).toContain("scene.id === 'availability'");
    expect(guided).toContain("scene.id === 'booking_settings'");
    expect(guided).toContain('activeSection="booking_window"');
    expect(guided).not.toContain('option-booking-settings-heading');
  });

  it('guided sections are flat (no nested cards) and pricing SUPPORT is schedule-based', () => {
    const editor = readFileSync(resolve(__dirname, '../BookingOptionEditor.tsx'), 'utf8');
    const guided = read('TourOptionGuidedScenes.tsx');
    expect(editor).toContain('flat={guided}');
    expect(editor).toMatch(/if \(flat\) \{\s*return <div className="space-y-3\.5">\{children\}<\/div>;/);
    expect(guided).toContain(
      "pricing: 'Set how guests are charged and max travelers per start time. Schedules set price and booking size.'"
    );
    expect(guided).toContain('density="compact"');
    expect(guided).toContain('hideProgress');
    expect(guided).toContain('TourOptionScheduleList');
    const scheduleList = read('TourOptionScheduleList.tsx');
    expect(scheduleList).toContain('Schedules');
    expect(scheduleList).toContain('LISTING_OPTION_SCHEDULES_MAX');
    expect(scheduleList).toContain('scheduleListRowModel');
    expect(scheduleList).toMatch(/role="button"/);
    const listHelpers = readFileSync(
      resolve(__dirname, '../../../lib/listing-schedule-list.ts'),
      'utf8'
    );
    expect(listHelpers).toContain("return 'Not set'");
  });

  it('syncs the option editor with ?option= and ?optionScene= query params', () => {
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    const url = readFileSync(resolve(__dirname, '../../../lib/listing-option-editor-url.ts'), 'utf8');
    expect(url).toContain('OPTION_EDITOR_URL_PARAM');
    expect(form).toContain('writeOptionEditorUrl');
    expect(form).toContain('readOptionEditorUrl');
    expect(form).toContain("addEventListener('popstate'");
  });

  it('renders restrained option cards with labeled actions once each', () => {
    const card = read('TourOptionCard.tsx');
    const model = readFileSync(resolve(__dirname, '../../../lib/listing-option-card.ts'), 'utf8');
    expect(card).toMatch(/>\s*Edit\s*<\/button>/);
    expect(card).toMatch(/>\s*Duplicate\s*<\/button>/);
    expect(card).toMatch(/onClick=\{onRequestDelete\}[\s\S]*>\s*Delete\s*<\/button>/);
    expect(card).not.toContain('Edit details');
    expect(card).not.toContain('lc-tile--attention');
    expect(card.match(/onClick=\{onEdit\}/g)?.length).toBe(1);
    expect(model).toContain("kind: 'manage_schedules'");
    expect(model).toContain("label: 'Schedules'");
    expect(model).toContain("statusLabel = 'Schedule required'");
  });
});
