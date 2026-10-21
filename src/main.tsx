import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installStaleChunkReload } from './lib/stale-chunk-reload';
import { installWebVitalsLite } from './lib/web-vitals-lite';
import {
  redirectIfPasswordRecoveryLandingInWrongPlace,
  redirectLegacyTravelerResetPasswordPath,
} from './lib/authRecoveryRedirect';
import { redirectMainDomainAdminToStaffLogin } from './lib/adminHost';
import {
  redirectTravelerMarketingSupplierPathsToPartnerHost,
  rewriteTravelerMarketingLoginToTravelerAuth,
  rewriteLegacySupplierPathsOnPartnerHost,
  normalizePartnerHostForSupplierSpa,
} from './lib/partnerHost';
import App from './App.tsx';
import './index.css';

installStaleChunkReload();
installWebVitalsLite();

redirectIfPasswordRecoveryLandingInWrongPlace();
redirectLegacyTravelerResetPasswordPath();
redirectMainDomainAdminToStaffLogin();
redirectTravelerMarketingSupplierPathsToPartnerHost();
rewriteTravelerMarketingLoginToTravelerAuth();
rewriteLegacySupplierPathsOnPartnerHost();
normalizePartnerHostForSupplierSpa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
