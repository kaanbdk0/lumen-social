import { Composition } from "remotion";
import { LumenQuoteVideo } from "./LumenQuoteVideo.jsx";

export const RemotionRoot = () => {
  return (
    <Composition
      id="LumenQuote"
      component={LumenQuoteVideo}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        figureName: "Mevlana",
        quoteText: "Yaralı olan yere derman gelir, nereye su dökülürse orası yeşerir.",
        bustImage: "bust_mevlana.png",
        lifeSpan: "1207 – 1273",
      }}
    />
  );
};
