/** Skelet til faneskift på studiesiden, så navigationen føles øjeblikkelig. */
export default function StudyLoading() {
  return (
    <div className="space-y-4" aria-busy aria-label="Indlæser">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20" />
        ))}
      </div>
      <div className="skeleton h-64" />
      <div className="skeleton h-40" />
    </div>
  );
}
