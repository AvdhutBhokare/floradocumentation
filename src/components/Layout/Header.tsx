import { useRef, useState } from 'react';
import { useFloraStore } from '../../store/useFloraStore';
import { exportToExcel, exportToCsv, exportTreesToKml } from '../../services/excel/exportExcel';

interface Props {
  onImportExcel: () => void;
  onImportKml: () => void;
}

export function Header({ onImportExcel, onImportKml }: Props) {
  const project = useFloraStore((s) => s.project);
  const setProjectName = useFloraStore((s) => s.setProjectName);
  const newProject = useFloraStore((s) => s.newProject);
  const persist = useFloraStore((s) => s.persist);
  const dirty = useFloraStore((s) => s.dirty);
  const trees = useFloraStore((s) => s.trees);
  const undo = useFloraStore((s) => s.undo);
  const redo = useFloraStore((s) => s.redo);
  const undoStackLen = useFloraStore((s) => s.undoStack.length);
  const redoStackLen = useFloraStore((s) => s.redoStack.length);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  async function handleSave() {
    await persist();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  }

  function handleNewProject() {
    const name = window.prompt('New project name', 'Flora Survey - Site A');
    if (!name) return;
    if (trees.length > 0 && !window.confirm('Start a new project? Unsaved changes to the current project will be lost unless you saved them.')) {
      return;
    }
    newProject(name);
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline bg-bark-950 px-4">
      <div className="flex items-center gap-4">
        <div className="flex flex-col leading-tight">
          <span className="font-display text-sm font-semibold tracking-wide text-paper-100">
            Flora Documentation GIS Manager
          </span>
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                setProjectName(nameDraft.trim() || project.name);
                setEditingName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  setNameDraft(project.name);
                  setEditingName(false);
                }
              }}
              className="mt-0.5 w-56 rounded border border-hairline bg-bark-900 px-1.5 py-0.5 font-mono text-[11px] text-paper-200"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setNameDraft(project.name);
                setEditingName(true);
              }}
              className="mt-0.5 w-fit font-mono text-[11px] text-bark-500 hover:text-flag"
              title="Click to rename project"
            >
              {project.name}
              {dirty && <span className="ml-1 text-flag">●</span>}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <ToolbarButton onClick={undo} disabled={undoStackLen === 0} title="Undo (Ctrl+Z)">
          ↶ Undo
        </ToolbarButton>
        <ToolbarButton onClick={redo} disabled={redoStackLen === 0} title="Redo (Ctrl+Y)">
          ↷ Redo
        </ToolbarButton>

        <Divider />

        <ToolbarButton onClick={onImportExcel}>Import Excel</ToolbarButton>
        <ToolbarButton onClick={onImportKml}>Import KML</ToolbarButton>

        <Divider />

        <ToolbarButton onClick={handleSave} tone={savedFlash ? 'success' : undefined}>
          {savedFlash ? 'Saved ✓' : 'Save'}
        </ToolbarButton>

        <div className="relative" ref={exportMenuRef}>
          <ToolbarButton onClick={() => setExportMenuOpen((v) => !v)}>Export ▾</ToolbarButton>
          {exportMenuOpen && (
            <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-md border border-hairline bg-bark-850 shadow-xl">
              <MenuItem
                onClick={() => {
                  exportToExcel(trees, project.name);
                  setExportMenuOpen(false);
                }}
              >
                Export Excel (.xlsx)
              </MenuItem>
              <MenuItem
                onClick={() => {
                  exportToCsv(trees, project.name);
                  setExportMenuOpen(false);
                }}
              >
                Export CSV
              </MenuItem>
              <MenuItem
                onClick={() => {
                  exportTreesToKml(trees, project.name);
                  setExportMenuOpen(false);
                }}
              >
                Export Trees as KML
              </MenuItem>
            </div>
          )}
        </div>

        <Divider />

        <div className="relative">
          <ToolbarButton onClick={() => setSettingsOpen((v) => !v)}>Settings</ToolbarButton>
          {settingsOpen && (
            <div className="absolute right-0 z-50 mt-1 w-52 overflow-hidden rounded-md border border-hairline bg-bark-850 shadow-xl">
              <MenuItem
                onClick={() => {
                  handleNewProject();
                  setSettingsOpen(false);
                }}
              >
                New Project…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setNameDraft(project.name);
                  setEditingName(true);
                  setSettingsOpen(false);
                }}
              >
                Rename Project…
              </MenuItem>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px bg-hairline" />;
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: 'success';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded px-2.5 py-1.5 font-sans text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        tone === 'success'
          ? 'bg-existing text-bark-950'
          : 'text-paper-200 hover:bg-bark-800 hover:text-paper-100'
      }`}
    >
      {children}
    </button>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-2 text-left font-sans text-xs text-paper-200 hover:bg-bark-800"
    >
      {children}
    </button>
  );
}
