export function ExperienceIllustration() {
  return (
    <figure className="space-y-3">
      <figcaption className="font-semibold">EXP needed for the same stat level-up</figcaption>
      <dl className="space-y-3">
        {[100, 150, 200].map(required => (
          <div key={required} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3">
            <dt className="text-right font-semibold tabular-nums">{required}%</dt>
            <dd className="grid grid-cols-4 gap-1">
              {Array.from({ length: required / 50 }, (_, index) => (
                <span key={index} className={`h-5 rounded-sm border ${index < 2
                  ? "border-primary/45 bg-primary/25"
                  : "border-amber-600/60 bg-amber-400/40 dark:border-amber-300/60"}`} aria-hidden="true" />
              ))}
              <span className="sr-only">{required === 100 ? "Base EXP" : `Base EXP plus ${required - 100}% extra`}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">The first two segments are the usual EXP cost. Gold shows how much more that stat takes to train.</p>
    </figure>
  );
}
