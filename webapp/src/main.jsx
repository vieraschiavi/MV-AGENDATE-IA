import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';

// HashRouter: la SPA vive en /app/ servida como archivo estático por Express
// (y por Vercel) — con hash routing no hace falta ninguna regla de rewrite.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
