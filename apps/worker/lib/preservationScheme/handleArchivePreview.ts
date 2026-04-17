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

function isTwitterUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname === "x.com" || hostname === "twitter.com";
  } catch {
    return false;
  }
}

async function dismissTwitterModal(page: Page): Promise<void> {
  try {
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 8000 });
  } catch {
    // tweet element not found, proceed anyway
  }

  // dismiss login/signup modal if visible
  try {
    const overlay = page.locator(
      '[data-testid="sheetDialog"], [aria-label="Sign in"], [aria-label="Sign up"]'
    );
    if (await overlay.first().isVisible({ timeout: 2000 })) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  } catch {
    // no modal, continue
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
  // Fall through to the screenshot path instead.
  const skipOgImage = isTwitterUrl(link.url);

  if (!skipOgImage && ogImageUrl) {
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
    if (skipOgImage) {
      await dismissTwitterModal(page);
    }

    await page
      .screenshot({ type: "jpeg", quality: 20 })
      .then(async (screenshot) => {
        if (
          Buffer.byteLength(screenshot) >
          1024 * 1024 * Number(process.env.PREVIEW_MAX_BUFFER || 10)
        )
          return console.log("Error generating preview: Buffer size exceeded");

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
      });
  }
};

export default handleArchivePreview;
