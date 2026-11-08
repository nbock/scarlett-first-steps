import React from 'react';
import {createRoot} from 'react-dom/client';
import Board from './board';
import Host from './host';
import Invite from './invite';
import './style.css';
const path=window.location.pathname.replace(/\/+$/,'');
createRoot(document.getElementById('root')!).render(<React.StrictMode>{path.endsWith('/host')?<Host/>:path.endsWith('/invite')?<Invite/>:<Board/>}</React.StrictMode>);
