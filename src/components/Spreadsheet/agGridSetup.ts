import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';

let registered = false;
export function ensureAgGridModulesRegistered() {
  if (registered) return;
  ModuleRegistry.registerModules([AllCommunityModule]);
  registered = true;
}
