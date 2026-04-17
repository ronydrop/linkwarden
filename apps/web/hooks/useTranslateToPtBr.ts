import { useState, useEffect } from "react";

const cache = new Map<string, string>();

export default function useTranslateToPtBr(text: string | undefined) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!text) return;

    const key = text.slice(0, 500);

    if (cache.has(key)) {
      setTranslated(cache.get(key)!);
      return;
    }

    setLoading(true);

    fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(key)}&langpair=en|pt-BR`
    )
      .then((r) => r.json())
      .then((data) => {
        const result = data?.responseData?.translatedText ?? key;
        cache.set(key, result);
        setTranslated(result);
      })
      .catch(() => setTranslated(key))
      .finally(() => setLoading(false));
  }, [text]);

  return { translated, loading };
}
