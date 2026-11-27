import { AbsoluteFill, Img, staticFile } from "remotion";
import { brand } from "../brand";
import { Character, type CharacterLook, type CharacterPalette } from "../components/Character";

/** Style test: Open Peeps recoloured piece by piece, on FutureTutor panels. */
const CASES: Array<{ label: string; look: CharacterLook; palette: CharacterPalette; panel: string }> = [
  {
    label: "Coach Alex — explique",
    look: { body: "ButtonShirt", hair: "ShortVolumed", face: "Explaining" },
    palette: { line: brand.navy, clothes: "#DCE7F5", skin: "#FFFFFF" },
    panel: brand.blue,
  },
  {
    label: "Coach Alex — montre",
    look: { body: "Explaining", hair: "ShortVolumed", face: "Smile" },
    palette: { line: brand.navy, clothes: "#DCE7F5", skin: "#FFFFFF" },
    panel: "#DBEAFE",
  },
  {
    label: "Mélanie, élève",
    look: { body: "Sweater", hair: "LongCurly", face: "Concerned" },
    palette: { line: brand.navy, clothes: "#FDE68A", skin: "#F5D7BF" },
    panel: "#DBEAFE",
  },
  {
    label: "Mme Tremblay, parent",
    look: { body: "Turtleneck", hair: "MediumStraight", face: "Calm", accessory: "GlassRound" },
    palette: { line: brand.navy, clothes: "#D1FAE5", skin: "#C98E62" },
    panel: brand.mint,
  },
];

export function PeepsColorTest() {
  return (
    <AbsoluteFill style={{ background: brand.offWhite, fontFamily: brand.fontFamily }}>
      <Img src={staticFile("brand/logo-horizontal-light.png")} style={{ position: "absolute", top: 40, left: 60, height: 60 }} />
      <div style={{ position: "absolute", top: 150, left: 60, right: 60, bottom: 40, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 30 }}>
        {CASES.map((item) => (
          <div key={item.label} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ flex: 1, background: item.panel, borderRadius: 28, overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <Character look={item.look} palette={item.palette} style={{ width: "100%", height: "auto" }} />
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: brand.navy, textAlign: "center" }}>{item.label}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
