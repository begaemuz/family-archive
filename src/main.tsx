import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';
import { restorePanelWidth } from './components/panel/PanelResizer';
import { startUpdateCheck } from './pwa/update';

restorePanelWidth();
startUpdateCheck();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
