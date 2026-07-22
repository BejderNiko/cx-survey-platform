/** Skelet, der vises øjeblikkeligt ved navigation, mens serverdata hentes. */
export default function AppLoading() {
  return (
    <div className="space-y-5" aria-busy aria-label="Indlæser">
      <div className="space-y-2">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20" />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-14" />
        ))}
      </div>
    </div>
  );
}
