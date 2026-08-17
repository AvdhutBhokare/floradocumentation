import { useMemo, useState } from 'react';
import { useFloraStore } from '../../store/useFloraStore';
import { useZoneStatsList, useSpeciesList, useZoneNameList } from '../../store/selectors';
import type { ZoneReviewStatus } from '../../types/tree';

const STATUS_META: Record<ZoneReviewStatus, { glyph: string; color: string }> = {
  'Not Reviewed': { glyph: '—', color: 'text-bark-500' },
  'Needs Data': { glyph: '⚠', color: 'text-flag' },
  Reviewed: { glyph: '✓', color: 'text-new' },
  Completed: { glyph: '✓', color: 'text-existing' },
};

export function ZonePanel() {
  const zoneStats = useZoneStatsList();
  const speciesList = useSpeciesList();
  const zoneNames = useZoneNameList();

  const filters = useFloraStore((s) => s.filters);
  const setFilters = useFloraStore((s) => s.setFilters);
  const resetFilters = useFloraStore((s) => s.resetFilters);

  const selectedZoneName = useFloraStore((s) => s.selectedZoneName);
  const selectZone = useFloraStore((s) => s.selectZone);
  const zoneReviewMode = useFloraStore((s) => s.zoneReviewMode);
  const setZoneReviewMode = useFloraStore((s) => s.setZoneReviewMode);
  const setZoneReviewStatus = useFloraStore((s) => s.setZoneReviewStatus);

  const trees = useFloraStore((s) => s.trees);
  const selectTree = useFloraStore((s) => s.selectTree);

  const [tab, setTab] = useState<'zones' | 'filters'>('zones');
  const [searchInput, setSearchInput] = useState('');

  const searchResults = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return [];
    return trees
      .filter((t) =>
        [t.id, t.speciesName, t.zoneName, t.treeStatus, String(t.latitude ?? ''), String(t.longitude ?? '')]
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 20);
  }, [searchInput, trees]);

  const activeFilterCount = [
    filters.zone,
    filters.species,
    filters.status,
    filters.mapped,
    filters.complete,
    filters.reviewStatus,
  ].filter(Boolean).length;

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-hairline bg-bark-900">
      {/* Search */}
      <div className="border-b border-hairline p-3">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search Tree ID, species, zone…"
          className="flora-input"
        />
        {searchResults.length > 0 && (
          <div className="mt-2 max-h-52 overflow-y-auto rounded border border-hairline bg-bark-850">
            {searchResults.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  selectTree(t.id, 'search');
                  setSearchInput('');
                }}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-left hover:bg-bark-800"
              >
                <span className="font-mono text-[11px] text-flag">{t.id}</span>
                <span className="truncate pl-2 font-sans text-[11px] text-paper-200">
                  {t.speciesName || '(unnamed)'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-hairline">
        <TabButton active={tab === 'zones'} onClick={() => setTab('zones')} label="ZONES" />
        <TabButton
          active={tab === 'filters'}
          onClick={() => setTab('filters')}
          label={`FILTERS${activeFilterCount ? ` (${activeFilterCount})` : ''}`}
        />
      </div>

      {tab === 'zones' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-bark-500">
              Zone Review
            </span>
            <button
              type="button"
              onClick={() => setZoneReviewMode(!zoneReviewMode)}
              className={`rounded px-2 py-0.5 font-sans text-[10px] font-medium ${
                zoneReviewMode ? 'bg-flag text-bark-950' : 'border border-hairline text-bark-500 hover:text-paper-200'
              }`}
            >
              {zoneReviewMode ? 'Review Mode: ON' : 'Review Mode: OFF'}
            </button>
          </div>

          {zoneStats.length === 0 && (
            <div className="px-3 py-6 text-center font-sans text-xs text-bark-500">
              Import a KML boundary file to see zones here, or zones will appear automatically once
              tree records reference a Zone Name.
            </div>
          )}

          <ul>
            {zoneStats.map((z) => {
              const meta = STATUS_META[z.reviewStatus];
              const isSelected = z.zoneName === selectedZoneName;
              return (
                <li key={z.zoneName}>
                  <button
                    type="button"
                    onClick={() => selectZone(isSelected ? null : z.zoneName)}
                    className={`flex w-full flex-col gap-1 border-b border-hairline/60 px-3 py-2 text-left hover:bg-bark-850 ${
                      isSelected ? 'bg-bark-850' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-sans text-sm font-medium text-paper-100">{z.zoneName}</span>
                      <span className={`font-mono text-sm ${meta.color}`}>{meta.glyph}</span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-[10px] text-bark-500">
                      <span>
                        {z.total} trees · {z.mapped} mapped
                        {z.incomplete > 0 ? ` · ${z.incomplete} incomplete` : ''}
                      </span>
                    </div>
                  </button>
                  {isSelected && (
                    <div className="flex flex-wrap gap-1 border-b border-hairline/60 bg-bark-950 px-3 py-2">
                      {(['Not Reviewed', 'Needs Data', 'Reviewed', 'Completed'] as ZoneReviewStatus[]).map(
                        (status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setZoneReviewStatus(z.zoneName, status)}
                            className={`rounded px-2 py-1 font-sans text-[10px] font-medium ${
                              z.reviewStatus === status
                                ? 'bg-flag text-bark-950'
                                : 'border border-hairline text-bark-500 hover:text-paper-200'
                            }`}
                          >
                            {status}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tab === 'filters' && (
        <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
          <FilterSelect
            label="Zone"
            value={filters.zone}
            onChange={(v) => setFilters({ zone: v })}
            options={zoneNames}
          />
          <FilterSelect
            label="Species"
            value={filters.species}
            onChange={(v) => setFilters({ species: v })}
            options={speciesList}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => setFilters({ status: v as 'Existing' | 'New' | null })}
            options={['Existing', 'New']}
          />
          <FilterSelect
            label="Mapped"
            value={filters.mapped}
            onChange={(v) => setFilters({ mapped: v as 'mapped' | 'unmapped' | null })}
            options={['mapped', 'unmapped']}
          />
          <FilterSelect
            label="Completeness"
            value={filters.complete}
            onChange={(v) => setFilters({ complete: v as 'complete' | 'incomplete' | null })}
            options={['complete', 'incomplete']}
          />
          <FilterSelect
            label="Review Status"
            value={filters.reviewStatus}
            onChange={(v) => setFilters({ reviewStatus: v as ZoneReviewStatus | null })}
            options={['Not Reviewed', 'Needs Data', 'Reviewed', 'Completed']}
          />
          <button
            type="button"
            onClick={resetFilters}
            className="w-full rounded border border-hairline py-1.5 font-sans text-xs font-medium text-paper-200 hover:bg-bark-800"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 border-b-2 py-2 font-sans text-[11px] font-semibold tracking-wide ${
        active ? 'border-flag text-paper-100' : 'border-transparent text-bark-500 hover:text-paper-200'
      }`}
    >
      {label}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-sans text-[11px] font-medium uppercase tracking-wide text-bark-500">
        {label}
      </span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="flora-input"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
