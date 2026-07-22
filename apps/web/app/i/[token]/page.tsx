import { lt } from "@ok/domain";
import { PublicRuntime } from "@/components/survey/public-runtime";
import { getInvitationSurvey } from "@/lib/data/respondent";

export default async function InvitationSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const survey = await getInvitationSurvey(token);

  if (!survey) {
    return <Shell><p className="text-center">Dette invitationslink er ikke gyldigt.</p></Shell>;
  }
  if (survey.alreadyCompleted) {
    return <Shell><p className="text-center">Du har allerede besvaret undersøgelsen — tak!</p></Shell>;
  }
  if (survey.studyStatus !== "live") {
    const closed = lt(survey.definition.messages?.closed, survey.definition.defaultLanguage);
    return <Shell><p className="text-center">{closed || "Undersøgelsen er lukket for besvarelser."}</p></Shell>;
  }
  return (
    <Shell>
      <PublicRuntime
        token={token}
        definition={survey.definition}
        studyTitle={survey.studyTitle}
        language={survey.language}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-xl">
        {children}
        <p className="mt-6 text-center text-xs text-muted">OK · CX &amp; Market Insights</p>
      </div>
    </main>
  );
}
