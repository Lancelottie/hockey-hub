import MatchManagementShell from "../match-management-shell";

export default async function FixtureLineupPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return <MatchManagementShell matchId={matchId} />;
}
