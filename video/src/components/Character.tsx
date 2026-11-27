import type { CSSProperties } from "react";
// Open Peeps (CC0) via react-peeps (MIT). Pieces are composed individually so
// each one gets its own colours (the library's own <Peep> paints all pieces alike).
import Pose from "react-peeps/lib/peeps/pose";
import Hair from "react-peeps/lib/peeps/hair";
import Face from "react-peeps/lib/peeps/face";
import FacialHair from "react-peeps/lib/peeps/facialHair";
import Accessories from "react-peeps/lib/peeps/accessories";

// react-peeps types each slot as a string union; looks are plain data here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPiece = any;

export interface CharacterLook {
  body: string;
  hair: string;
  face: string;
  facialHair?: string;
  accessory?: string;
}

/**
 * In Open Peeps the "hair" piece also draws the head, and hair strands use the
 * line colour: `skin` fills head, face and hands-free areas of the head; hair
 * therefore always takes the line colour.
 */
export interface CharacterPalette {
  line: string;
  clothes: string;
  skin: string;
}

/** One illustrated person. Swap `look.face` to change expression, `look.body` to change pose. */
export function Character({ look, palette, style }: { look: CharacterLook; palette: CharacterPalette; style?: CSSProperties }) {
  const line = palette.line;
  return (
    <svg viewBox="0 0 850 1200" style={style}>
      <Pose piece={look.body as AnyPiece} strokeColor={line} backgroundColor={palette.clothes} />
      <g transform="translate(225 0)">
        <Hair piece={look.hair as AnyPiece} strokeColor={line} backgroundColor={palette.skin} />
        <g transform="translate(159 186)">
          <Face piece={look.face as AnyPiece} strokeColor={line} backgroundColor={palette.skin} />
        </g>
        {look.facialHair && (
          <g transform="translate(123 338)">
            <FacialHair piece={look.facialHair as AnyPiece} strokeColor={line} backgroundColor={palette.skin} />
          </g>
        )}
        {look.accessory && (
          <g transform="translate(47 241)">
            <Accessories piece={look.accessory as AnyPiece} strokeColor={line} backgroundColor="transparent" />
          </g>
        )}
      </g>
    </svg>
  );
}
