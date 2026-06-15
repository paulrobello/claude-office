import type { FloorConfig } from "@/types/navigation";
import type { Session } from "@/hooks/useSessions";

/** Whether a session belongs to a configured floor (repo-name match). */
export function sessionMatchesFloor(
  session: Session,
  floor: FloorConfig,
): boolean {
  return floor.rooms.some((room) => {
    if (!room.repoName) return false;
    if (session.projectRoot) {
      const basename = session.projectRoot.split(/[/\\]/).pop();
      if (basename === room.repoName) return true;
    }
    return session.projectName === room.repoName;
  });
}
