import { Collection, Link, User } from "@linkwarden/prisma/client";
import { Page } from "playwright";
import { generatePreview } from "@linkwarden/lib/generatePreview";
import { createFile } from "@linkwarden/filesystem";
import { prisma } from "@linkwarden/prisma";
import {
  assertUrlIsSafeForServerSideFetch,
  UnsafeUrlError,
} from "@linkwarden/lib/ssrf";

type LinksAndCollectionAndOwner = Link & {
  collection: Collection & {
    owner: User;
  };
};

function extractTweetId(url: string): string | null {
  try {
    const match = url.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function isTwitterUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname === "x.com" || hostname === "twitter.com";
  } catch {
    return false;
  }
}

// Screenshot the tweet embed (platform.twitter.com/embed) to bypass X.com bot detection.
async function screenshotTweetEmbed(
  page: Page,
  tweetId: string
): Promise<Buffer | null> {
  try {
    const embedUrl = `https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=dark&lang=en`;
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto(embedUrl, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForSelector("article, .EmbeddedTweet, [data-scribe]", {
      timeout: 10000,
    });
    return await page.screenshot({ type: "jpeg", quality: 20 });
  } catch {
    return null;
  }
}

const handleArchivePreview = async (
  link: LinksAndCollectionAndOwner,
  page: Page
) => {
  let ogImageUrl = await page.evaluate(() => {
    const metaTag = document.querySelector('meta[property="og:image"]');
    return metaTag ? (metaTag as any).content : null;
  });

  let previewGenerated = false;

  // Skip og:image for Twitter/X — it resolves to the X logo for text-only tweets.
  // Use the public tweet embed instead, which renders tweet content without auth.
  const twitterUrl = isTwitterUrl(link.url);

  if (!twitterUrl && ogImageUrl) {
    if (
      !ogImageUrl.startsWith("http://") &&
      !ogImageUrl.startsWith("https://")
    ) {
      const origin = await page.evaluate(() => document.location.origin);
      ogImageUrl =
        origin + (ogImageUrl.startsWith("/") ? ogImageUrl : "/" + ogImageUrl);
    }

    try {
      await assertUrlIsSafeForServerSideFetch(ogImageUrl);
      const imageResponse = await page.goto(ogImageUrl);

      if (imageResponse && !link.preview?.startsWith("archive")) {
        const buffer = await imageResponse.body();
        previewGenerated = await generatePreview(
          buffer,
          link.collectionId,
          link.id
        );
      }

      await page.goBack();
    } catch (error) {
      if (!(error instanceof UnsafeUrlError)) {
        throw error;
      }
    }
  }

  if (!previewGenerated && !link.preview?.startsWith("archive")) {
    let screenshot: Buffer | undefined;

    if (twitterUrl && link.url) {
      const tweetId = extractTweetId(link.url);
      if (tweetId) {
        const embedShot = await screenshotTweetEmbed(page, tweetId);
        if (embedShot) screenshot = embedShot;
      }
    }

    if (!screenshot) {
      screenshot = await page.screenshot({ type: "jpeg", quality: 20 });
    }

    if (
      Buffer.byteLength(screenshot) >
      1024 * 1024 * Number(process.env.PREVIEW_MAX_BUFFER || 10)
    ) {
      console.log("Error generating preview: Buffer size exceeded");
      return;
    }

    await createFile({
      data: screenshot,
      filePath: `archives/preview/${link.collectionId}/${link.id}.jpeg`,
    });

    await prisma.link.update({
      where: { id: link.id },
      data: {
        preview: `archives/preview/${link.collectionId}/${link.id}.jpeg`,
      },
    });
  }
};

export default handleArchivePreview;
