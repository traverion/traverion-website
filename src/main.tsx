import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { redirectMainDomainAdminToStaffLogin } from './lib/adminHost';
import App from './App.tsx';
import './index.css';

redirectMainDomainAdminToStaffLogin();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
