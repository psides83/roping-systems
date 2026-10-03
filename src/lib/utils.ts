import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatPhoneNumber(value: string | null | undefined) {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return value;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const titleCaseLowercaseWords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "with",
]);

const titleCaseUppercaseWords = new Set([
  "ba",
  "fm",
  "nfr",
  "td",
  "ucr",
  "us",
  "usa",
  "wpra",
  "wrc",
]);

const stateAbbreviations = new Set([
  "ak",
  "al",
  "ar",
  "az",
  "ca",
  "co",
  "ct",
  "dc",
  "de",
  "fl",
  "ga",
  "hi",
  "ia",
  "id",
  "il",
  "in",
  "ks",
  "ky",
  "la",
  "ma",
  "md",
  "me",
  "mi",
  "mn",
  "mo",
  "ms",
  "mt",
  "nc",
  "nd",
  "ne",
  "nh",
  "nj",
  "nm",
  "nv",
  "ny",
  "oh",
  "ok",
  "or",
  "pa",
  "pr",
  "ri",
  "sc",
  "sd",
  "tn",
  "tx",
  "ut",
  "va",
  "vt",
  "wa",
  "wi",
  "wv",
  "wy",
]);

function capitalizeWordPart(value: string) {
  if (!value || /^#?\d+(?:\.\d+)?$/.test(value)) return value;
  const lower = value.toLocaleLowerCase("en-US");
  if (titleCaseUppercaseWords.has(lower))
    return lower.toLocaleUpperCase("en-US");
  if (/^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/.test(lower))
    return lower.toLocaleUpperCase("en-US");
  if (/^mc[a-z]/.test(lower))
    return `Mc${lower.charAt(2).toLocaleUpperCase("en-US")}${lower.slice(3)}`;
  return `${lower.charAt(0).toLocaleUpperCase("en-US")}${lower.slice(1)}`;
}

function formatTitleCaseWord(
  value: string,
  index: number,
  lastIndex: number,
  nextWord?: string,
) {
  const lower = value.toLocaleLowerCase("en-US");
  if (
    stateAbbreviations.has(lower) &&
    (index === lastIndex || /^\d{5}(?:-\d{4})?$/.test(nextWord ?? ""))
  )
    return lower.toLocaleUpperCase("en-US");
  if (/^(?:jr|sr)\.?$/.test(lower))
    return `${lower.charAt(0).toLocaleUpperCase("en-US")}${lower.slice(1)}`;
  if (
    index > 0 &&
    index < lastIndex &&
    titleCaseLowercaseWords.has(lower) &&
    !titleCaseUppercaseWords.has(lower)
  )
    return lower;
  if (/^\d+-[a-z]$/i.test(value)) return value.toLocaleUpperCase("en-US");

  return value
    .split(/([-\/'])/)
    .map((part, partIndex, parts) => {
      if (["-", "/", "'"].includes(part)) return part;
      if (
        parts[partIndex - 1] === "'" &&
        ["s", "d", "t"].includes(part.toLocaleLowerCase("en-US"))
      )
        return part.toLocaleLowerCase("en-US");
      return capitalizeWordPart(part);
    })
    .join("");
}

export function formatProperNoun(value: string) {
  const words = value.trim().replace(/\s+/g, " ").split(" ");
  return words
    .map((word, index) =>
      formatTitleCaseWord(word, index, words.length - 1, words[index + 1]),
    )
    .join(" ");
}
