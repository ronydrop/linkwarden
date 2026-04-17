import {
  ArchivedFormat,
  LinkIncludingShortenedCollectionAndTags,
} from "@linkwarden/types/global";
import React, { useState } from "react";
import Image from "next/image";
import { formatAvailable } from "@linkwarden/lib/formatStats";
import LinkActions from "@/components/LinkViews/LinkComponents/LinkActions";
import useTranslateToPtBr from "@/hooks/useTranslateToPtBr";
import { TFunction } from "i18next";
import unescapeString from "@/lib/client/unescapeString";

type Props = {
  link: LinkIncludingShortenedCollectionAndTags;
  t: TFunction<"translation", undefined>;
};

function extractTweetData(name: string, url: string) {
  const usernameMatch = url.match(
    /(?:twitter\.com|x\.com)\/([^/]+)\/status\//i
  );
  const username = usernameMatch ? usernameMatch[1] : null;

  // "Author Name on X: "tweet text"" pattern
  const onXMatch = name.match(/^(.+?) on X:\s*[""](.+?)[""](?:\s*\/\s*X)?$/i);
  if (onXMatch) {
    return {
      author: onXMatch[1].trim(),
      handle: username ? `@${username}` : "",
      text: onXMatch[2].trim(),
    };
  }

  // Old "tweet text / Twitter" pattern
  const twitterSlash = name.replace(/\s*\/\s*Twitter\s*$/, "").trim();

  return {
    author: username ?? "Usuário",
    handle: username ? `@${username}` : "",
    text: twitterSlash,
  };
}

function TweetCard({ link, t }: Props) {
  const [linkModal, setLinkModal] = useState(false);

  const rawName = unescapeString(link.name) ?? "";
  const url = link.url ?? "";
  const { author, handle, text } = extractTweetData(rawName, url);
  const { translated, loading } = useTranslateToPtBr(text);

  const displayText = translated ?? text;
  const isDifferent = translated && translated !== text;
  const initials = (author || handle).slice(0, 2).toUpperCase();

  const savedAt = link.createdAt
    ? new Date(link.createdAt).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="relative group border border-solid border-neutral-content bg-base-200 rounded-2xl p-4 hover:bg-base-300 transition-colors duration-100">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-content text-sm font-bold shrink-0 select-none">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate leading-tight">{author}</p>
            {handle && (
              <p className="text-neutral text-xs truncate">{handle}</p>
            )}
          </div>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-neutral hover:text-[#1d9bf0] transition-colors mt-0.5"
          title="Ver no X"
          onClick={(e) => e.stopPropagation()}
        >
          <i className="bi-twitter-x text-base" />
        </a>
      </div>

      {/* Tweet text */}
      <div className="mb-3 text-sm leading-relaxed">
        {loading ? (
          <div className="space-y-1.5">
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-4/5 rounded" />
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap break-words">{displayText}</p>
            {isDifferent && (
              <p className="mt-1.5 text-xs text-neutral italic line-clamp-2">
                {text}
              </p>
            )}
          </>
        )}
      </div>

      {/* Image preview */}
      {formatAvailable(link, "preview") && (
        <div className="mb-3 rounded-xl overflow-hidden border border-neutral-content">
          <Image
            src={`/api/v1/archives/${link.id}?format=${ArchivedFormat.jpeg}&preview=true&updatedAt=${link.updatedAt}`}
            width={600}
            height={300}
            alt=""
            className="w-full object-cover max-h-64"
            unoptimized
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-neutral mt-1">
        {savedAt && <span>{savedAt}</span>}
        {link.tags && link.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap justify-end">
            {link.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full"
              >
                #{tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions overlay */}
      <LinkActions
        link={link}
        linkModal={linkModal}
        t={t}
        setLinkModal={(e) => setLinkModal(e)}
        className="absolute top-3 right-10 group-hover:opacity-100 group-focus-within:opacity-100 opacity-0 duration-100 text-neutral z-20"
      />
    </div>
  );
}

export default React.memo(TweetCard);
