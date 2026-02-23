export function TopBar() {
    return (
        <header className="relative z-10 flex h-auto items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 px-3 py-2.5 md:h-[52px] md:px-4">
            <div className="min-w-0">
                <p className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-slate-400">
                    Digital Deck Monitor
                </p>
                <h1 className="font-display text-base uppercase tracking-[0.12em] text-slate-100 md:text-lg">
                    Groov
                </h1>
            </div>
            <div className="hidden items-center gap-2 md:flex">
                <span className="rounded-full border border-slate-600 bg-slate-800 px-2.5 py-1 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-slate-300">
                    Studio View
                </span>
            </div>
        </header>
    );
}
