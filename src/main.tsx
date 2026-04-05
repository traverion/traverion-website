import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { redirectIfPasswordRecoveryLandingInWrongPlace } from './lib/authRecoveryRedirect';
import { redirectMainDomainAdminToStaffLogin } from './lib/adminHost';
import App from './App.tsx';
import './index.css';

redirectIfPasswordRecoveryLandingInWrongPlace();
redirectMainDomainAdminToStaffLogin();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
