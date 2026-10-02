import { ResultsDashboard } from "./results-dashboard";

/** Resultat-fanen: aggregerede resultater pr. spørgsmål + individuelle besvarelser. */
export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filters?: string; ask?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  return <ResultsDashboard studyId={id} search={search} />;
}
