import { AvatarImage } from './AvatarImage.tsx';

/**
 * The player's own portrait, framed like the trader's across the table: the
 * signed-in Google avatar, or a silhouette when there's no photo.
 */
export function PlayerAvatar({ avatarUrl, size = 72, active = false }: {
  avatarUrl: string | null;
  size?: number;
  /** Their turn: the ring turns gold. */
  active?: boolean;
}) {
  return (
    <span
      className={`trader-portrait player-avatar${active ? ' player-avatar-active' : ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="You"
    >
      <AvatarImage avatarUrl={avatarUrl} />
    </span>
  );
}
