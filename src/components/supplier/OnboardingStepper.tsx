import { Building2, Check, ClipboardCheck, FileText, UserRound, Wallet, type LucideIcon } from 'lucide-react';
import {
  ONBOARDING_PHASE_STEPS,
  onboardingPhaseIndex,
  type SupplierOnboardingPhase,
} from '../../lib/supplier-onboarding-steps';

const ICONS: Record<SupplierOnboardingPhase, LucideIcon> = {
  business: Building2,
  documents: FileText,
  representative: UserRound,
  payout: Wallet,
  status: ClipboardCheck,
};

type Props = {
  phase: SupplierOnboardingPhase;
  onSelect: (phase: SupplierOnboardingPhase) => void;
  canSelect: (phase: SupplierOnboardingPhase) => boolean;
};

export default function OnboardingStepper({ phase, onSelect, canSelect }: Props) {
  const current = onboardingPhaseIndex(phase);
  return (
    <nav className="supplier-stepper" aria-label="Setup progress">
      <ol>
        {ONBOARDING_PHASE_STEPS.map((step, index) => {
          const mode = index < current ? 'done' : index === current ? 'current' : 'upcoming';
          const selectable = mode === 'done' && canSelect(step.phase);
          const Icon = ICONS[step.phase];
          return (
            <li key={step.phase} className={`supplier-stepper__item is-${mode}`}>
              <button
                type="button"
                aria-current={mode === 'current' ? 'step' : undefined}
                aria-label={`${step.label}${mode === 'done' ? ', complete' : mode === 'current' ? ', current' : ', upcoming'}`}
                disabled={!selectable && mode !== 'current'}
                onClick={() => {
                  if (selectable) onSelect(step.phase);
                }}
              >
                <span className="supplier-stepper__mark">
                  {mode === 'done' ? (
                    <Check className="supplier-stepper__check h-4 w-4" strokeWidth={2.5} aria-hidden />
                  ) : (
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  )}
                </span>
                <span className="supplier-stepper__label">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
