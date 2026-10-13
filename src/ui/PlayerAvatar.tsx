import { AvatarImage } from './AvatarImage.tsx';

/**
 * The player's own portrait, framed like the trader's across the table: the
 * signed-in Google avatar, or a silhouette when there's no photo.
 */
export function PlayerAvatar({ avatarUrl, size = 72, active = false, label = 'You' }: {
  avatarUrl: string | null;
  size?: number;
  /** Their turn: the ring turns gold. */
  active?: boolean;
  /** Who it is, for screen readers — a friend's name online. */
  label?: string;
}) {
  return (
    <span
      className={`trader-portrait player-avatar${active ? ' player-avatar-active' : ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <AvatarImage avatarUrl={avatarUrl} />
    </span>
  );
}
