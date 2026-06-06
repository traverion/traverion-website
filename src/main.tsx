import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  redirectIfPasswordRecoveryLandingInWrongPlace,
  redirectLegacyTravelerResetPasswordPath,
} from './lib/authRecoveryRedirect';
import { redirectMainDomainAdminToStaffLogin } from './lib/adminHost';
import {
  redirectTravelerMarketingSupplierPathsToPartnerHost,
  redirectTravelerMarketingPartnerLoginShortcut,
  rewriteLegacySupplierPathsOnPartnerHost,
  normalizePartnerHostForSupplierSpa,
} from './lib/partnerHost';
import App from './App.tsx';
import './index.css';

redirectIfPasswordRecoveryLandingInWrongPlace();
redirectLegacyTravelerResetPasswordPath();
redirectMainDomainAdminToStaffLogin();
redirectTravelerMarketingSupplierPathsToPartnerHost();
redirectTravelerMarketingPartnerLoginShortcut();
rewriteLegacySupplierPathsOnPartnerHost();
normalizePartnerHostForSupplierSpa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
