/**
 * The player's own portrait, framed like the trader's across the table: the
 * signed-in Google avatar, or their initial when there's no photo.
 */
export function PlayerAvatar({ avatarUrl, label, size = 72, active = false }: {
  avatarUrl: string | null;
  /** Initial(s) shown when there's no photo. */
  label: string;
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
      {avatarUrl ? (
        <img src={avatarUrl} alt="" draggable={false} referrerPolicy="no-referrer" />
      ) : (
        <span className="player-avatar-initial" style={{ fontSize: Math.round(size * 0.42) }}>{label}</span>
      )}
    </span>
  );
}
