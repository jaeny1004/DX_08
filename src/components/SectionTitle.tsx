interface SectionTitleProps {
  title: string;
}

export default function SectionTitle({ title }: SectionTitleProps) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
      <h1 className="text-xl font-black tracking-tight text-slate-950">
        {title}
      </h1>
    </div>
  );
}
