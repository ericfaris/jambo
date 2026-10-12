/**
 * Brass corner brackets for a player's tableau panel — the same metalwork as
 * the turn plaque, so both seats read as fitted market furniture.
 */
export function TableauCorners() {
  return (
    <>
      <span className="tableau-corner tableau-corner-tl" aria-hidden="true" />
      <span className="tableau-corner tableau-corner-tr" aria-hidden="true" />
      <span className="tableau-corner tableau-corner-bl" aria-hidden="true" />
      <span className="tableau-corner tableau-corner-br" aria-hidden="true" />
    </>
  );
}
