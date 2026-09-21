import MatchManagementShell from "../match-management-shell";

export default async function FixtureLineupPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ tab?: string; highlight?: string }>;
}) {
  const { matchId } = await params;
  const { tab, highlight } = await searchParams;
  return (
    <MatchManagementShell
      matchId={matchId}
      initialTab={tab === "captain-tasks" || tab === "post-match" ? tab : "lineup"}
      highlightOutstanding={highlight === "outstanding"}
    />
  );
}
