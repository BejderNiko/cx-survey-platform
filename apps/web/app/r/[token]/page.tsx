import { getRecruitmentPage } from "@/lib/data/recruitment";
import { RecruitmentRuntime } from "@/components/recruitment/recruitment-runtime";

export default async function RecruitmentPagePublic({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await getRecruitmentPage(token);

  if (!page) {
    return <Shell background="#f6f4f0"><p className="text-center">Dette rekrutteringslink er ikke gyldigt.</p></Shell>;
  }

  return (
    <Shell background={page.backgroundColor} imageUrl={page.backgroundImageUrl}>
      {page.headerImageUrl && (
        <div className={`mb-4 flex ${page.headerLogoPosition === "center" ? "justify-center" : page.headerLogoPosition === "right" ? "justify-end" : "justify-start"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={page.headerImageUrl} alt="" className="h-12 w-auto" />
        </div>
      )}
      <RecruitmentRuntime
        token={token}
        pageTitle={page.pageTitle}
        pageContent={page.pageContent}
        screeningEnabled={page.screeningEnabled}
        screeningQuestionContent={page.screeningQuestionContent}
        screeningContinueLabel={page.screeningContinueLabel}
        screeningEndLabel={page.screeningEndLabel}
        screeningEndContent={page.screeningEndContent}
        thankYouContent={page.thankYouContent}
        questions={page.questions}
      />
    </Shell>
  );
}

function Shell({ children, background, imageUrl }: { children: React.ReactNode; background: string; imageUrl?: string | null }) {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-4"
      style={{
        backgroundColor: background,
        backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="w-full max-w-xl">
        {children}
        <p className="mt-6 text-center text-xs text-muted">OK · CX &amp; Market Insights</p>
      </div>
    </main>
  );
}
