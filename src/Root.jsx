import { Composition } from "remotion";
import { LumenQuoteVideo } from "./LumenQuoteVideo.jsx";
import { LumenPost } from "./LumenPost.jsx";
import { LumenReel } from "./LumenReel.jsx";

const POST_DEFAULTS = {
  figureName: "Marcus Aurelius",
  quoteText: "Hayatımızın mutluluğu, düşüncelerimizin kalitesine bağlıdır.",
  bustImage: "bust_marcus_aurelius.png",
  background: "bg/antik/bg_00.jpg",
  lifeSpan: "121 – 180",
  handle: "@lumen",
};

export const RemotionRoot = () => {
  return (
    <>
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
      {/* Instagram feed post — 4:5 */}
      <Composition
        id="LumenPostFeed"
        component={LumenPost}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1350}
        defaultProps={POST_DEFAULTS}
      />
      {/* TikTok / story photo — 9:16 */}
      <Composition
        id="LumenPostTall"
        component={LumenPost}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={POST_DEFAULTS}
      />
      {/* Short Reel — themed paintings cross-fade behind bust + quote. 9:16, ~20s */}
      <Composition
        id="LumenReel"
        component={LumenReel}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          figureName: "Marcus Aurelius",
          quoteText: "Hayatımızın mutluluğu, düşüncelerimizin kalitesine bağlıdır.",
          bustImage: "bust_marcus_aurelius.png",
          lifeSpan: "121 – 180",
          handle: "@lumen.app",
          layout: "C",
          backgrounds: [
            "bg/antik/bg_00.jpg", "bg/antik/bg_01.jpg", "bg/antik/bg_02.jpg",
            "bg/antik/bg_03.jpg", "bg/antik/bg_04.jpg",
          ],
        }}
      />
    </>
  );
};
