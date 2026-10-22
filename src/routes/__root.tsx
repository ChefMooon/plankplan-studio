import { createRootRoute, Outlet } from '@tanstack/react-router';
export const Route = createRootRoute({ component: () => <><a className="skip-link" href="#main-content">Skip to content</a><div id="main-content"><Outlet /></div></> });
