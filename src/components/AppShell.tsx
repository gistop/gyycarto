import { TopNavigation } from './TopNavigation';
import { WorkspaceLayout } from './WorkspaceLayout';

export function AppShell() {
  return (
    <div className="app-shell">
      <TopNavigation />
      <WorkspaceLayout />
    </div>
  );
}
