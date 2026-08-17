import { useDashboardStats } from '../../store/selectors';

export function StatsBar() {
  const stats = useDashboardStats();

  const items: { label: string; value: number; tone?: string }[] = [
    { label: 'Total Trees', value: stats.total },
    { label: 'Existing', value: stats.existing, tone: 'text-existing' },
    { label: 'New', value: stats.newTrees, tone: 'text-new' },
    { label: 'Zones', value: stats.zones },
    { label: 'Mapped', value: stats.mapped, tone: 'text-existing' },
    { label: 'Unmapped', value: stats.unmapped, tone: stats.unmapped > 0 ? 'text-danger' : undefined },
    { label: 'Incomplete', value: stats.incomplete, tone: stats.incomplete > 0 ? 'text-flag' : undefined },
  ];

  return (
    <div className="flex shrink-0 divide-x divide-hairline border-b border-hairline bg-bark-900">
      {items.map((item) => (
        <div key={item.label} className="flex flex-1 flex-col items-center justify-center py-2">
          <span className={`font-mono text-lg font-semibold leading-none ${item.tone ?? 'text-paper-100'}`}>
            {item.value.toLocaleString()}
          </span>
          <span className="mt-1 font-sans text-[10px] uppercase tracking-wide text-bark-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
