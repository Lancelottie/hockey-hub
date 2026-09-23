"use client";
import { useTeam } from "@/lib/team-context";
import DiscussionBoard from "./discussion-board";

export default function DiscussionsPage() {
  const { activeTeam, club, canWrite, userId } = useTeam();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-[var(--text-primary)]">
          Discussions
        </h1>
        <p className="text-[var(--text-secondary)]">
          {activeTeam ? `Managing ${activeTeam.name}` : "Select a team"}
        </p>
      </div>
      {activeTeam ? (
        <DiscussionBoard clubId={club.id} teamId={activeTeam.id} currentUserId={userId} canManage={canWrite} />
      ) : (
        <p className="text-[var(--text-secondary)]">Select a team to see its discussion board.</p>
      )}
    </div>
  );
}
