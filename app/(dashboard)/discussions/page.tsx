"use client";
import { useTeam } from "@/lib/team-context";
import DiscussionBoard from "./discussion-board";

export default function DiscussionsPage() {
  const { club, canWrite, userId } = useTeam();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-[var(--text-primary)]">
          Discussions
        </h1>
        <p className="text-[var(--text-secondary)]">{club.name} — every section, every team</p>
      </div>
      <DiscussionBoard clubId={club.id} currentUserId={userId} canManage={canWrite} />
    </div>
  );
}
