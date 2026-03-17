interface StatCardProps {
  value: string;
  label: string;
}

export function StatCard({ value, label }: StatCardProps) {
  return (
    <div className="text-center">
      <div className="text-[22px] font-bold font-mono text-white">{value}</div>
      <div className="text-[11px] text-[#9CA3AF] uppercase tracking-[0.5px] mt-0.5">{label}</div>
    </div>
  );
}
