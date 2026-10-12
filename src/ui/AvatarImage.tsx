import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

/** Head-and-shoulders placeholder for a player with no Google photo. */
export function AvatarSilhouette({ style }: { style?: CSSProperties }) {
  return (
    <svg className="avatar-silhouette" viewBox="0 0 64 64" aria-hidden="true" focusable="false" style={style}>
      <circle cx="32" cy="25" r="12" />
      <path d="M8 64c0-14 10.7-23 24-23s24 9 24 23z" />
    </svg>
  );
}

/**
 * The signed-in player's Google photo, or a silhouette when there is none or
 * it fails to load (expired/blocked googleusercontent URLs do happen).
 */
export function AvatarImage({ avatarUrl, style }: { avatarUrl: string | null; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatarUrl]);

  if (!avatarUrl || failed) return <AvatarSilhouette style={style} />;
  return (
    <img
      src={avatarUrl}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={style}
    />
  );
}
